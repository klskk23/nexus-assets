import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { NewAssetDialog } from "@/features/assets/NewAssetDialog"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { chooseByLabel } from "@/test/choose"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate }
})

const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: (p: string, b: unknown) => post(p, b), patch: vi.fn(), del: vi.fn() },
  }
})

const categories = [
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: null, path: "/rt/", display_key: "" },
]
const schema = {
  category: categories[0],
  fields: [
    { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 10 },
  ],
}
const withLocation = [
  { id: "loc", type: "location", name: "上海仓库", parent_id: null, is_default_stock: true },
  { id: "loc2", type: "location", name: "北京仓库", parent_id: null, is_default_stock: false },
]

function route(path: string, holders: unknown[] = withLocation) {
  const st = statusRoute(path)
  if (st) return st

  if (path === "/categories") return Promise.resolve(categories)
  if (path === "/holders") return Promise.resolve(holders)
  if (path === "/models") return Promise.resolve([])
  if (path.endsWith("/schema")) return Promise.resolve(schema)
  return Promise.resolve([])
}

beforeEach(() => {
  navigate.mockReset()
  get.mockReset().mockImplementation((p: string) => route(p))
  post.mockReset().mockResolvedValue({ id: "a1", display_name: "112394521950" })
})

describe("NewAssetDialog", () => {
  // The status used to be inferred from whether a location had been picked,
  // and the picker started empty -- so recording a device that was sitting in
  // the warehouse produced "已签出" and never said so.
  it("starts in stock, at the default stock point", async () => {
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )
    expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("上海仓库")
  })

  it("records the chosen status and holder", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} initialCategoryID="rt" />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )

    await chooseByLabel(user, "持有方", /北京仓库/)
    await user.type(await screen.findByLabelText(/基准 MAC/), "001A2B3C4D5E")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/assets",
        expect.objectContaining({
          category_id: "rt",
          status: "in_stock",
          holder_type: "entity",
          holder_id: "loc2",
        }),
      ),
    )
  })

  it("lets the status be something other than in stock", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} initialCategoryID="rt" />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )

    await chooseByLabel(user, "状态", "维修中")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/assets", expect.objectContaining({ status: "in_repair" })),
    )
  })

  // No status constrains the kind of holder any more, so every holder on file
  // is on offer -- and a device can start out in a company's custody.
  it("offers every holder, and the account, whatever the status", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )

    await user.click(screen.getByRole("combobox", { name: "持有方" }))
    const options = await screen.findAllByRole("option")
    for (const o of options) {
      expect(o).not.toHaveAttribute("aria-disabled", "true")
    }
    // Signed out in this harness, so the account reads as the "none" label --
    // what matters is that it is offered and not disabled.
    expect(options.map((o) => o.textContent)).toContain("无")
  })

  // A fresh install has no holders at all, and the first device still has to
  // be recordable -- held by the person recording it.
  it("falls back to the account when no holder exists yet", async () => {
    get.mockImplementation((p: string) => route(p, []))
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)

    // In stock is still the default: the status no longer cares where it sits,
    // so an install with no holders at all still records its first device.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )
    expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("无")
  })

  it("goes to the new device after recording it", async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={onOpenChange} initialCategoryID="rt" />)
    await screen.findByLabelText(/基准 MAC/)

    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/assets/a1"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("cannot be submitted without a category", async () => {
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)
    await screen.findByRole("combobox", { name: "类别" })
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })
})
