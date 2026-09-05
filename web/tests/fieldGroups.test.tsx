import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldGroups } from "@/routes/FieldGroups"
import { listed } from "@/test/listing"
import { renderWithProviders } from "@/test/renderWithProviders"
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

const fields = [
  { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true },
  { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false },
  { id: "f3", key: "tunnels", label: "隧道数", type: "number", options: {}, is_unique: false },
]

const groups = [{ id: "g-net", name: "网络参数", field_ids: ["f1", "f2"] }]

function route(p: string) {
  if (p.startsWith("/field-groups")) return Promise.resolve(listed(groups, p))
  if (p.startsWith("/fields")) {
    return Promise.resolve({ items: fields, total: fields.length, offset: 0, limit: 500 })
  }
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  const triggers = await screen.findAllByRole("button", { name: "新建字段组" })
  await user.click(triggers[0])
  await screen.findByRole("dialog")
}

describe("Field groups page", () => {
  it("lists each group with the fields in it", async () => {
    renderWithProviders(<FieldGroups />)
    const row = await screen.findByRole("row", { name: /网络参数/ })
    expect(within(row).getByText(/基准 MAC/)).toBeInTheDocument()
    expect(within(row).getByText(/固件版本/)).toBeInTheDocument()
  })

  it("creates a group with the fields ticked on the form", async () => {
    const user = userEvent.setup()
    renderWithProviders(<FieldGroups />)
    await screen.findByRole("row", { name: /网络参数/ })

    await openCreate(user)
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("组名"), "维保参数")
    await user.click(within(dialog).getByLabelText("隧道数"))
    await user.click(within(dialog).getByRole("button", { name: "新建字段组" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/field-groups", {
        name: "维保参数",
        field_ids: ["f3"],
      }),
    )
  })

  it("replaces the members wholesale when the group is edited", async () => {
    const user = userEvent.setup()
    renderWithProviders(<FieldGroups />)
    await user.click(await screen.findByRole("row", { name: /网络参数/ }))

    const dialog = await screen.findByRole("dialog")
    // Untick one, tick another: what comes back is the new list, not a merge.
    await user.click(within(dialog).getByLabelText("固件版本"))
    await user.click(within(dialog).getByLabelText("隧道数"))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/field-groups/g-net", {
        name: "网络参数",
        field_ids: ["f1", "f3"],
      }),
    )
  })

  // Deleting a group unbinds nothing: the expansion left no trace to reverse,
  // and the confirmation has to say so rather than let somebody assume it does.
  it("says that deleting a group unbinds nothing", async () => {
    const user = userEvent.setup()
    renderWithProviders(<FieldGroups />)
    const row = await screen.findByRole("row", { name: /网络参数/ })

    await chooseFromMenu(user, row, "删除")
    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText(/一个都不会解绑/)).toBeInTheDocument()

    await user.type(within(confirm).getByRole("textbox"), "网络参数")
    await user.click(within(confirm).getByRole("button", { name: "删除" }))
    await waitFor(() => expect(del).toHaveBeenCalledWith("/field-groups/g-net"))
  })
})
