import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Fields } from "@/routes/Fields"
import { Holders } from "@/routes/Holders"
import { Users } from "@/routes/Users"
import { Categories } from "@/routes/Categories"
import { listed } from "@/test/listing"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseFromMenu, openMenu } from "@/test/menu"
import { ApiError } from "@/lib/api"

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: vi.fn(),
    },
  }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: "net", path: "/net/rt/", display_key: "" },
]

const fields = [
  { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true,
    required: true, category_ids: ["net"], model_ids: [] },
  { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false,
    category_ids: ["net"], model_ids: [] },
  // Bound the other way (015): it belongs to models, not to a category.
  { id: "f3", key: "servicetag", label: "ServiceTag", type: "text", options: {}, is_unique: true,
    category_ids: [], model_ids: ["m1"], vendor_ids: [] },
]

const productModels = [
  { id: "m1", category_ids: ["net"], name: "Latitude 5420", vendor_name: "Dell", attr_defaults: {} },
]

const holders = [
  { id: "h1", type: "location", name: "上海仓库", parent_id: null, is_default_stock: false },
  { id: "h2", type: "company", name: "XX 集团", parent_id: null, is_default_stock: false },
  { id: "h3", type: "location", name: "北京仓库", parent_id: null, is_default_stock: true },
]

const users = [
  { id: "u1", email: "admin@example.com", name: "管理员", auth_type: "local", status: "active" },
  { id: "u2", email: "old@example.com", name: "离职同事", auth_type: "local", status: "disabled" },
]

const schema = {
  category: categories[1],
  fields: [
    { ...fields[0], required: true, sort: 10, inherited_from: "net" },
    { ...fields[1], required: false, sort: 20 },
  ],
}

function route(p: string) {
  if (p === "/categories") return Promise.resolve(categories)
  if (p === "/categories/counts") return Promise.resolve({ net: 2, rt: 2 })
  if (p === "/models") return Promise.resolve(productModels)
  // The library is paged and filterable now, so it answers with an envelope.
  if (p.startsWith("/fields")) {
    return Promise.resolve({ items: fields, total: fields.length, offset: 0, limit: 20 })
  }
  // How many devices a required binding would land on.
  if (p.startsWith("/assets?")) return Promise.resolve({ items: [], total: 3, offset: 0, limit: 1 })
  if (p.startsWith("/holders")) return Promise.resolve(listed(holders, p))
  if (p.startsWith("/users")) return Promise.resolve(listed(users, p))
  if (p.endsWith("/schema")) return Promise.resolve(schema)
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
})

/** Opens the create dialog. The trigger and the submit share a label, so the
 *  one in the header is the one to press. */
async function openCreate(user: ReturnType<typeof userEvent.setup>, label: string) {
  const triggers = await screen.findAllByRole("button", { name: label })
  await user.click(triggers[0])
  await screen.findByRole("dialog")
}

/**
 * The fields page, which 025 turned into a rail beside a detail pane.
 *
 * The columns these tests used to read -- type, uniqueness, required, what a
 * field binds to -- did not go away; they moved into the pane, where they can
 * be shown in full rather than squeezed into a cell. So the assertions moved
 * with them rather than being deleted.
 */
function atField(id: string, opts: Record<string, unknown> = {}) {
  return renderWithProviders(<Fields />, {
    route: `/fields/${id}`,
    path: ["/fields", "/fields/:id"],
    ...opts,
  })
}

describe("Fields page", () => {
  it("says a field's type and where its uniqueness holds", async () => {
    atField("f1")
    expect(await screen.findByRole("heading", { name: "基准 MAC" })).toBeInTheDocument()
    expect(screen.getByText("MAC 地址")).toBeInTheDocument()
    // Not just "unique": it holds inside one chain, never globally (v6
    // decision 71), and the unqualified word would be read as the global
    // promise it is not.
    expect(screen.getByText("类别内唯一")).toBeInTheDocument()
  })

  // Required is the field's own flag since 018, so one place can answer for it.
  // The pane always carries the label, so the answer is the value beside it --
  // asserting on the word alone would pass for both fields.
  it("says whether a field asks for a value", async () => {
    const required = (label: string) =>
      screen.getByText(label).parentElement?.textContent ?? ""

    const { unmount } = atField("f1")
    await screen.findByRole("heading", { name: "基准 MAC" })
    expect(required("必填")).toContain("是")
    unmount()

    atField("f2")
    await screen.findByRole("heading", { name: "固件版本" })
    expect(required("必填")).toContain("否")
  })

  // A device-bound field used to read "未绑定" under a column headed 所属类别 --
  // true about categories, and a lie about the field.
  it("names the devices a field binds to instead of calling it unbound", async () => {
    atField("f3")
    await screen.findByRole("heading", { name: "ServiceTag" })
    expect(screen.getByText("设备内唯一")).toBeInTheDocument()
    expect(screen.queryByText("未绑定")).not.toBeInTheDocument()
  })

  it("字段组不再是页签，而是树上的父节点", async () => {
    renderWithProviders(<Fields />, { route: "/fields", path: ["/fields", "/fields/:id"] })
    await screen.findByRole("link", { name: /基准 MAC/ })
    expect(screen.queryByRole("tab", { name: "字段组" })).not.toBeInTheDocument()
  })
})


describe("Holders page", () => {
  // The marker is set where everything else about a holder is set. A control
  // inside a clickable row fired the row's handler too, so pressing it also
  // opened the editor -- two things from one click, one of them unasked for.
  it("offers the default stock marker only on a location, inside the editor", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    await user.click(await screen.findByRole("row", { name: /上海仓库/ }))
    let dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText("设为默认库存点")).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(screen.getByRole("row", { name: /XX 集团/ }))
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByLabelText("设为默认库存点")).not.toBeInTheDocument()
  })

  it("marks a location as the default stock point", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    await user.click(await screen.findByRole("row", { name: /上海仓库/ }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByLabelText("设为默认库存点"))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/holders/h1",
        expect.objectContaining({ is_default_stock: true }),
      ),
    )
  })

  // The marker moves but never switches off, so the location that holds it
  // gets a ticked, locked box -- a toggle here would only ever be refused.
  it("locks the box on the location that already holds the marker", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    const current = await screen.findByRole("row", { name: /北京仓库/ })
    expect(within(current).getByText("默认库存点")).toBeInTheDocument()

    await user.click(current)
    const box = within(await screen.findByRole("dialog")).getByLabelText("设为默认库存点")
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
  })

  // Renaming a warehouse must not carry a marker request along with it: the
  // server refuses is_default_stock:false, so sending it on every save would
  // turn an ordinary rename into that refusal.
  it("sends no marker request when the box was not ticked", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    await user.click(await screen.findByRole("row", { name: /上海仓库/ }))
    const dialog = await screen.findByRole("dialog")
    await user.clear(within(dialog).getByLabelText("名称"))
    await user.type(within(dialog).getByLabelText("名称"), "上海一号仓")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).not.toHaveProperty("is_default_stock")
  })

  it("surfaces a refusal from the server rather than swallowing it", async () => {
    patch.mockRejectedValueOnce(
      new ApiError(409, "reference_blocked", "「北京仓库」是当前默认库存点，请先转移"),
    )
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    await user.click(await screen.findByRole("row", { name: /上海仓库/ }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByLabelText("设为默认库存点"))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    // Inside the dialog, which is still open: the page behind it is
    // aria-hidden and covered, so an alert out there reaches nobody.
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("是当前默认库存点")
  })
})

describe("Users page", () => {
  it("separates active from disabled accounts", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)
    const active = await screen.findByRole("row", { name: /admin@example.com/ })
    expect(within(active).getByText("正常")).toBeInTheDocument()
    await openMenu(user, active)
    expect(screen.getByRole("menuitem", { name: "停用" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    )
    await user.keyboard("{Escape}")

    const disabled = screen.getByRole("row", { name: /old@example.com/ })
    expect(within(disabled).getByText("已停用")).toBeInTheDocument()
    // Offered and disabled rather than missing: it is already disabled.
    await openMenu(user, disabled)
    expect(screen.getByRole("menuitem", { name: "停用" })).toHaveAttribute("aria-disabled", "true")
  })

  it("shows why disabling was refused instead of failing quietly", async () => {
    patch.mockRejectedValue(
      new ApiError(409, "reference_blocked", "user still owns assets: 15 asset(s) must be transferred first"),
    )
    const user = userEvent.setup()
    renderWithProviders(<Users />)
    const active = await screen.findByRole("row", { name: /admin@example.com/ })
    await chooseFromMenu(user, active, "停用")
    // Disabling cannot be undone, so it asks for the email first.
    const confirm = await screen.findByRole("alertdialog")
    await user.type(within(confirm).getByRole("textbox"), "admin@example.com")
    await user.click(within(confirm).getByRole("button", { name: "停用" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("15 asset(s) must be transferred first")
  })
})

describe("Categories page", () => {
  // No dialog. This is the whole point of 024: what a category records used to
  // be visible only inside the edit dialog, so answering the question for two
  // categories meant opening and closing one per category, comparing from
  // memory because the dialog hid the tree behind it.
  it("lists a category's fields, and where each one came from, without opening anything", async () => {
    renderWithProviders(<Categories />, { route: "/categories/rt", path: "/categories/:id" })

    const inherited = await screen.findByRole("row", { name: /基准 MAC/ })
    expect(within(inherited).getByText("网络设备")).toBeInTheDocument()
    expect(within(inherited).getByText("必填")).toBeInTheDocument()

    const own = screen.getByRole("row", { name: /固件版本/ })
    expect(within(own).queryByText("网络设备")).not.toBeInTheDocument()

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  // Binding is answered on the field, where "where does this belong" is the
  // question being asked (v6 decision 72). The pane says so and stops there.
  it("字段那一块只读：没有解绑，也没有排序手柄", async () => {
    renderWithProviders(<Categories />, { route: "/categories/rt", path: "/categories/:id" })
    const row = await screen.findByRole("row", { name: /基准 MAC/ })

    expect(within(row).queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /解绑/ })).not.toBeInTheDocument()
  })
})

// The server has attached the blocking devices since the first version. The
// client parsed only `referrers` and dropped these, leaving the page with a
// count and no way to act on it.
it("lists the blocking devices when a holder cannot take the marker", async () => {
  patch.mockRejectedValueOnce(
    new ApiError(
      409,
      "reference_blocked",
      "「上海仓库」仍被 7 台设备使用，请先转移或改绑后再停用",
      undefined,
      undefined,
      [
        { asset_id: "a1", name: "112394521950", reason: "holder" },
        { asset_id: "a2", name: "112394521951", reason: "reference" },
      ],
      7,
    ),
  )
  const user = userEvent.setup()
  renderWithProviders(<Holders />)
  await user.click(await screen.findByRole("row", { name: /上海仓库/ }))
  const dialog = await screen.findByRole("dialog")
  await user.click(within(dialog).getByLabelText("设为默认库存点"))
  await user.click(within(dialog).getByRole("button", { name: "保存" }))

  const alert = await within(dialog).findByRole("alert")
  expect(alert).toHaveTextContent("112394521950")
  expect(alert).toHaveTextContent("112394521951")
  // Two of seven were sent, so the page has to say the list is partial.
  expect(alert).toHaveTextContent("等共 7 台")
})

// The wart the dialog made unavoidable: creating never cleared the form, so
// reopening showed the last record you made and one edited field away from a
// near-duplicate.
describe("create dialog resets", () => {
  it("reopens blank after creating a holder", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)
    await screen.findByRole("row", { name: /上海仓库/ })

    await openCreate(user, "新建持有方")
    let dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("名称"), "北京仓库")
    await user.click(within(dialog).getByRole("button", { name: "新建持有方" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/holders", {
        type: "location", name: "北京仓库", note: "", parent_id: null,
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await openCreate(user, "新建持有方")
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText("名称")).toHaveValue("")
  })

  // Dismissing counts too: a half-typed record should not be waiting next time.
  it("clears what was typed when the dialog is dismissed", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)
    await screen.findByRole("row", { name: /admin@example.com/ })

    await openCreate(user, "新建本地账号")
    let dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("姓名"), "张三")
    await user.click(within(dialog).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await openCreate(user, "新建本地账号")
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText("姓名")).toHaveValue("")
  })

  // A row action's refusal has to appear next to the rows, not inside a dialog
  // the user has to open to find out what went wrong.
  it("shows a row-action refusal outside the create dialog", async () => {
    patch.mockRejectedValueOnce(
      new ApiError(409, "reference_blocked", "「上海仓库」仍被 5 台设备使用"),
    )
    const user = userEvent.setup()
    renderWithProviders(<Holders />)
    await user.click(await screen.findByRole("row", { name: /上海仓库/ }))
    const editor = await screen.findByRole("dialog")
    await user.click(within(editor).getByLabelText("设为默认库存点"))
    await user.click(within(editor).getByRole("button", { name: "保存" }))

    const alert = await within(editor).findByRole("alert")
    expect(alert).toHaveTextContent("仍被 5 台设备使用")
  })
})

// The field library grew two more ways to find something (016): which vendor
// provides it, and which group it is in.
// Binding a field to a model and then to that model's vendor leaves both rows,
// and the column used to read "Dell、Dell VEP-4600" -- two answers to one
// question, where the vendor already covers the model.
/**
 * Where a field is bound, in full.
 *
 * The old page had one cell for this and had to compress: a vendor binding
 * covering three models was written once rather than three times, because the
 * cell had no room to be honest. The pane has room, so it lists each target as
 * its own row and says which kind it is.
 *
 * Filtering the field list by vendor is gone with the column. The question it
 * answered -- "which fields does this vendor impose" -- is now on the vendor
 * itself, in the models page's pane, where it is a property of the vendor
 * rather than a filter over something else.
 */
describe("Fields page bindings", () => {
  const vendors = [{ id: "v-dell", name: "Dell", model_count: 2 }]
  const models = [
    { id: "m1", category_ids: ["net"], name: "VEP-4600", vendor_id: "v-dell", vendor_name: "Dell", attr_defaults: {} },
  ]
  const bound = [{ ...fields[2], model_ids: ["m1"], vendor_ids: ["v-dell"] }]

  beforeEach(() => {
    get.mockReset().mockImplementation((p: string) => {
      if (p === "/vendors") return Promise.resolve(vendors)
      if (p === "/models") return Promise.resolve(models)
      if (p.startsWith("/field-groups")) return Promise.resolve({ items: [], total: 0, offset: 0, limit: 500 })
      if (p.startsWith("/fields")) {
        return Promise.resolve({ items: bound, total: 1, offset: 0, limit: 500 })
      }
      return route(p)
    })
  })

  it("每个目标一行，并说出是哪一种", async () => {
    atField(fields[2].id)
    await screen.findByRole("heading", { name: "ServiceTag" })

    const model = screen.getByRole("row", { name: /VEP-4600/ })
    expect(within(model).getByText("型号")).toBeInTheDocument()
    const vendor = screen.getByRole("row", { name: /Dell/ })
    expect(within(vendor).getByText("厂商")).toBeInTheDocument()
  })
})
