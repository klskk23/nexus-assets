import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldGroups } from "@/routes/FieldGroups"
import { listed } from "@/test/listing"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseFromMenu } from "@/test/menu"
import { chooseByLabel } from "@/test/choose"
import { ApiError } from "@/lib/api"

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

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]
const productModels = [
  { id: "m1", category_ids: ["net"], name: "Latitude 5420", vendor_name: "Dell", attr_defaults: {} },
]
const vendors = [{ id: "v-dell", name: "Dell", model_count: 1 }]

function route(p: string) {
  if (p.startsWith("/field-groups")) return Promise.resolve(listed(groups, p))
  if (p === "/categories") return Promise.resolve(categories)
  if (p === "/models") return Promise.resolve(productModels)
  if (p === "/vendors") return Promise.resolve(vendors)
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

  // A group is a handful of fields, not a place of its own -- it sits behind
  // the field library rather than on the navigation bar. Its own address all
  // the same: two CrudPages behind one would share a search box and a page
  // number.
  it("sits beside the field library rather than on the navigation bar", async () => {
    renderWithProviders(<FieldGroups />)
    expect(await screen.findByRole("tab", { name: "字段" })).toHaveAttribute("href", "/fields")
    expect(screen.getByRole("tab", { name: "字段组" })).toHaveAttribute("href", "/fields/groups")
  })

  // The whole point of a group, and for one release there was no way to do it:
  // the only control lived in the field form, which was never handed the
  // groups, so it never rendered and nothing read what it would have set.
  //
  // It belongs here rather than there anyway -- binding a group is an act on a
  // target, not a property of any one field.
  it("binds a group to a category, a model or a vendor", async () => {
    const user = userEvent.setup()
    renderWithProviders(<FieldGroups />)
    const row = await screen.findByRole("row", { name: /网络参数/ })

    await chooseFromMenu(user, row, "绑定到…")
    const dialog = await screen.findByRole("dialog")

    // A category by default.
    await chooseByLabel(user, "选一个", "网络设备")
    await user.click(within(dialog).getByRole("button", { name: "绑定" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/categories/net/bindings", { group_id: "g-net" }),
    )

    // And the other two targets, through the same endpoint shape.
    await user.click(within(dialog).getByRole("radio", { name: "厂商" }))
    await chooseByLabel(user, "选一个", "Dell")
    await user.click(within(dialog).getByRole("button", { name: "绑定" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/vendors/v-dell/bindings", { group_id: "g-net" }),
    )
  })

  // Switching the target kind drops the pick: an id from the old list would
  // aim the request at whatever happens to share it.
  it("clears the chosen target when the kind changes", async () => {
    const user = userEvent.setup()
    renderWithProviders(<FieldGroups />)
    await chooseFromMenu(user, await screen.findByRole("row", { name: /网络参数/ }), "绑定到…")

    const dialog = await screen.findByRole("dialog")
    await chooseByLabel(user, "选一个", "网络设备")
    await user.click(within(dialog).getByRole("radio", { name: "型号" }))
    expect(within(dialog).getByRole("button", { name: "绑定" })).toBeDisabled()
  })

  // One member refused refuses the group, and the sentence has to land where
  // the person is looking -- the page behind is covered.
  it("shows a refusal inside the dialog", async () => {
    post.mockRejectedValue(
      new ApiError(409, "reference_blocked", "字段组「网络参数」没有绑定：其中的「基准 MAC」不能绑到这里。"),
    )
    const user = userEvent.setup()
    renderWithProviders(<FieldGroups />)
    await chooseFromMenu(user, await screen.findByRole("row", { name: /网络参数/ }), "绑定到…")

    const dialog = await screen.findByRole("dialog")
    await chooseByLabel(user, "选一个", "网络设备")
    await user.click(within(dialog).getByRole("button", { name: "绑定" }))

    expect(await within(dialog).findByText(/基准 MAC/)).toBeInTheDocument()
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
