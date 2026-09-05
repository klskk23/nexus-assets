import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Vendors } from "@/routes/Vendors"
import { Models } from "@/routes/Models"
import { listed } from "@/test/listing"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"
import { chooseFromMenu } from "@/test/menu"

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: (p: string) => del(p),
    },
  }
})

const vendors = [
  { id: "v-dell", name: "Dell", model_count: 2 },
  { id: "v-lenovo", name: "Lenovo", model_count: 0 },
]

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]

const productModels = [
  {
    id: "m1",
    category_ids: ["net"],
    name: "Latitude 5420",
    vendor_id: "v-dell",
    vendor_name: "Dell",
    attr_defaults: {},
  },
  {
    id: "m2",
    category_ids: ["net"],
    name: "无牌机",
    attr_defaults: {},
  },
]

function route(p: string) {
  if (p.startsWith("/vendors")) return Promise.resolve(listed(vendors, p))
  if (p.startsWith("/models/") && p.includes("vendor-change-impact")) {
    return Promise.resolve({ total: 4, fields: ["ServiceTag"] })
  }
  if (p.startsWith("/models")) return Promise.resolve(listed(productModels, p))
  if (p === "/categories") return Promise.resolve(categories)
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

async function openCreate(user: ReturnType<typeof userEvent.setup>, label: string) {
  const triggers = await screen.findAllByRole("button", { name: label })
  await user.click(triggers[0])
  await screen.findByRole("dialog")
}

describe("Vendors page", () => {
  it("lists the vendors with how many models come from each", async () => {
    renderWithProviders(<Vendors />)
    const row = await screen.findByRole("row", { name: /Dell/ })
    expect(within(row).getByText("2")).toBeInTheDocument()
  })

  it("creates a vendor", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Vendors />)
    await screen.findByRole("row", { name: /Dell/ })

    await openCreate(user, "新建厂商")
    await user.type(screen.getByLabelText("厂商名"), "华为")
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "新建厂商" }))

    await waitFor(() => expect(post).toHaveBeenCalledWith("/vendors", { name: "华为" }))
  })

  // Renaming is one row, which is the whole reason a vendor became a thing.
  it("renames a vendor from the row's editor", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Vendors />)
    await user.click(await screen.findByRole("row", { name: /Dell/ }))

    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByLabelText("厂商名")
    await user.clear(input)
    await user.type(input, "戴尔")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/vendors/v-dell", { name: "戴尔" }))
  })

  // Destructive, so it asks for the name to be typed -- the same rule every
  // other metadata page follows.
  it("asks for the name before deleting a vendor", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Vendors />)
    const row = await screen.findByRole("row", { name: /Lenovo/ })

    await chooseFromMenu(user, row, "删除")
    const confirm = await screen.findByRole("alertdialog")
    await user.type(within(confirm).getByRole("textbox"), "Lenovo")
    await user.click(within(confirm).getByRole("button", { name: "删除" }))

    await waitFor(() => expect(del).toHaveBeenCalledWith("/vendors/v-lenovo"))
  })

  // Two lists, two addresses: a CrudPage keeps its search and page number in
  // the address, so one address for both would have them trample each other.
  it("offers the models list as a separate address", async () => {
    renderWithProviders(<Vendors />)
    const tab = await screen.findByRole("tab", { name: "型号" })
    expect(tab).toHaveAttribute("href", "/models")
  })
})

describe("Models page", () => {
  it("picks the vendor from the registered ones rather than typing a name", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Models />)
    await screen.findByRole("row", { name: /Latitude 5420/ })

    await openCreate(user, "新建型号")
    await user.type(screen.getByLabelText("型号名"), "R640")
    await chooseByLabel(user, "厂商", "Dell")
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "新建型号" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/models", {
        category_ids: [],
        name: "R640",
        vendor_id: "v-dell",
        attr_defaults: {},
      }),
    )
  })

  it("says so plainly when a model has no vendor", async () => {
    renderWithProviders(<Models />)
    const row = await screen.findByRole("row", { name: /无牌机/ })
    expect(within(row).getByText("无厂商")).toBeInTheDocument()
  })

  // Changing the vendor takes fields away from every device of the model at
  // once. Mild -- the values stay, read-only -- but not something to discover
  // afterwards (decision 112).
  it("says how many devices a vendor change touches before saving it", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Models />)
    await user.click(await screen.findByRole("row", { name: /Latitude 5420/ }))

    const dialog = await screen.findByRole("dialog")
    await chooseByLabel(user, "厂商", "Lenovo")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText(/4 台设备/)).toBeInTheDocument()
    expect(within(confirm).getByText(/ServiceTag/)).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()

    await user.click(within(confirm).getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/models/m1",
        expect.objectContaining({ vendor_id: "v-lenovo" }),
      ),
    )
  })
})
