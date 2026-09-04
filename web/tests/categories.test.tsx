import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Categories } from "@/routes/Categories"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"
import { chooseFromMenu, openMenu } from "@/test/menu"

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

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: "net", path: "/net/rt/", display_key: "" },
]

const schema = {
  category: categories[1],
  fields: [
    // Bound here, so it can be detached here.
    { id: "f1", key: "rack", label: "机柜", type: "text", options: {}, is_unique: false, required: false, sort: 10 },
    // Inherited from the parent: detaching it is the parent's business.
    { id: "f2", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 20, inherited_from: "net" },
  ],
}

function route(p: string) {
  if (p === "/categories") return Promise.resolve(categories)
  if (p.startsWith("/fields")) return Promise.resolve({ items: [], total: 0, offset: 0, limit: 20 })
  if (p === "/capabilities") return Promise.resolve({ printing: true })
  if (p === "/print/presets") {
    return Promise.resolve({
      presets: [
        { id: "preset-rt", name: "路由器标签" },
        { id: "preset-sw", name: "交换机标签" },
      ],
    })
  }
  if (p === "/models") {
    return Promise.resolve([
      { id: "m1", category_ids: ["rt"], name: "X100", vendor: "Acme", attr_defaults: {} },
      { id: "m2", category_ids: ["net"], name: "别的机", vendor: "", attr_defaults: {} },
    ])
  }
  if (p.endsWith("/schema")) return Promise.resolve(schema)
  if (p.startsWith("/assets")) return Promise.resolve({ items: [], total: 3, offset: 0, limit: 1 })
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue(undefined)
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

/** The category row, which is what a person clicks to work on it. */
function categoryRow(name = /SDWAN 路由器/) {
  return screen.findByRole("row", { name })
}


describe("Categories page", () => {
  // Binding moved to the field itself, so what a category shows is the set it
  // ends up with -- its own and its ancestors' -- and where to change it.
  it("lists the fields it has, read-only, and says where they are bound", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await user.click(await categoryRow())

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("row", { name: /机柜/ })).toBeInTheDocument()
    // Where to change it is behind the question mark: the table is the answer
    // somebody opened this for, and the explanation is only wanted once.
    const heading = within(dialog).getByText("本类别的字段")
    await user.hover(within(heading.parentElement!).getByRole("button", { name: "这是什么" }))
    expect(await screen.findByText(/在「字段」页面上做/)).toBeInTheDocument()
    // Nothing here binds or unbinds any more.
    expect(within(dialog).queryByRole("combobox", { name: "绑定字段" })).not.toBeInTheDocument()
  })
})

// The tree and its bindings are what the page is for; creating a category is
// occasional, so the form waits behind a button instead of taking the top of
// the screen on every visit.
describe("Categories create dialog", () => {
  it("keeps the form behind a button", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await categoryRow()

    expect(screen.queryByLabelText(/代号/)).not.toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText(/代号/)).toBeInTheDocument()
  })

  it("creates a category and closes", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await categoryRow()

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/代号/), "SW")
    await user.type(within(dialog).getByLabelText("名称"), "交换机")
    await user.click(within(dialog).getByRole("button", { name: "新建类别" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/categories", {
        code: "SW",
        name: "交换机",
        parent_id: null,
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  // Reopening onto the last thing you created is a trap: edit one field,
  // submit, and you have quietly made a near-duplicate.
  it("reopens blank after a successful create", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await categoryRow()

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    let dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/代号/), "SW")
    await user.type(within(dialog).getByLabelText("名称"), "交换机")
    await user.click(within(dialog).getByRole("button", { name: "新建类别" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(/代号/)).toHaveValue("")
    expect(within(dialog).getByLabelText("名称")).toHaveValue("")
  })

  // A create failure belongs in the dialog; the page banner is for the binding
  // actions in the panel below, which are a different place entirely.
  it("shows a create failure inside the dialog", async () => {
    post.mockRejectedValue(new ApiError(409, "unique_conflict", "类别编码已存在"))
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await categoryRow()

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/代号/), "RT")
    await user.type(within(dialog).getByLabelText("名称"), "重复")
    await user.click(within(dialog).getByRole("button", { name: "新建类别" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("类别编码已存在")
  })
})

// Deleting a category is where the dependencies actually bite: children,
// assets anywhere beneath it, and models attached to it each stop it, and each
// refusal has to say which.
describe("Categories delete", () => {
  it("requires the category name to be typed out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await user.click(await categoryRow())
    await user.click(await screen.findByRole("button", { name: "删除类别" }))

    const dialog = await screen.findByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "删除类别" })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(/请输入/), "SDWAN 路由器")
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    await waitFor(() => expect(del).toHaveBeenCalledWith("/categories/rt"))
  })

  it("lists what is holding the category when the delete is refused", async () => {
    del.mockRejectedValue(
      new ApiError(
        409,
        "reference_blocked",
        "「SDWAN 路由器」下还有 2 台资产，请先把它们移到别处",
        undefined,
        undefined,
        [
          { kind: "asset", id: "a1", name: "112394521950" },
          { kind: "asset", id: "a2", name: "112394521951" },
        ],
        2,
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await user.click(await categoryRow())
    await user.click(await screen.findByRole("button", { name: "删除类别" }))

    const dialog = await screen.findByRole("alertdialog")
    await user.type(screen.getByLabelText(/请输入/), "SDWAN 路由器")
    await user.click(within(dialog).getByRole("button", { name: "删除类别" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("还有 2 台资产")
    expect(alert).toHaveTextContent("112394521950")
    expect(alert).toHaveTextContent("112394521951")
  })
})

// Deleting detaches attached models instead of refusing on them -- nothing in
// the interface can detach one, so a refusal would have been a dead end. What
// it must not be is silent.
it("names the models that will be detached before asking to confirm", async () => {
  const user = userEvent.setup()
  renderWithProviders(<Categories />)
  await user.click(await categoryRow())
  await user.click(await screen.findByRole("button", { name: "删除类别" }))

  const dialog = await screen.findByRole("alertdialog")
  expect(dialog).toHaveTextContent("以下型号将不再关联到该类别")
  expect(dialog).toHaveTextContent("X100")
  // A model attached elsewhere is not this category's business.
  expect(dialog).not.toHaveTextContent("别的机")
})

// The tree became the table every other list on this product is, so the
// hierarchy has to survive in the order, the indent and the row menu.
describe("Categories table", () => {
  it("lists a child under its parent, and folds it away from the row menu", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)

    const names = () =>
      screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "")
    await waitFor(() => expect(names()).toHaveLength(2))
    expect(names()[0]).toContain("网络设备")
    expect(names()[1]).toContain("SDWAN 路由器")

    await chooseFromMenu(user, await screen.findByRole("row", { name: /^网络设备/ }), "折叠子类别")
    await waitFor(() => expect(names()).toHaveLength(1))
    expect(screen.queryByRole("row", { name: /SDWAN 路由器/ })).not.toBeInTheDocument()

    await chooseFromMenu(user, await screen.findByRole("row", { name: /^网络设备/ }), "展开子类别")
    await waitFor(() => expect(names()).toHaveLength(2))
  })

  // Folding a leaf is not a thing; the item says so rather than doing nothing.
  it("disables folding on a category with no children", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)

    const menu = await openMenu(user, await screen.findByRole("row", { name: /SDWAN 路由器/ }))
    expect(within(menu).getByRole("menuitem", { name: "折叠子类别" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })

  it("opens the create form on the row it was asked from, with the parent filled in", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)

    await chooseFromMenu(user, await screen.findByRole("row", { name: /^网络设备/ }), "新建子类别")
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("combobox", { name: "上级类别" })).toHaveTextContent("网络设备")

    await user.type(within(dialog).getByLabelText(/代号/), "SW")
    await user.type(within(dialog).getByLabelText("名称"), "交换机")
    await user.click(within(dialog).getByRole("button", { name: "新建类别" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/categories", {
        code: "SW",
        name: "交换机",
        parent_id: "net",
      }),
    )
  })

  it("renames a category and moves it, without offering itself as its own parent", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)

    await user.click(await screen.findByRole("row", { name: /^网络设备/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText("名称")).toHaveValue("网络设备")

    // Its own subtree is not a destination: that would make it its own ancestor.
    await user.click(within(dialog).getByRole("combobox", { name: "上级类别" }))
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(options).not.toContain("网络设备")
    expect(options).not.toContain("SDWAN 路由器")
    await user.keyboard("{Escape}")

    await user.clear(within(dialog).getByLabelText("名称"))
    await user.type(within(dialog).getByLabelText("名称"), "网络")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/categories/net", {
        name: "网络",
        parent_id: null,
        display_key: "",
        print_preset_ids: [],
      }),
    )
  })
})

// The number field used to have its own card, its own save button and its own
// recompute button beside it. It is one of the three things this dialog saves.
describe("Category editor", () => {
  it("offers only unique fields as the number, and saves it with the rest", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await user.click(await categoryRow())

    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("combobox", { name: "用作编号的字段" }))
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent)
    // A number two devices can share is not an identifier.
    expect(options.some((o) => o?.includes("基准 MAC"))).toBe(true)
    expect(options.some((o) => o?.includes("机柜"))).toBe(false)

    await user.click(await screen.findByRole("option", { name: /基准 MAC/ }))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/categories/rt", {
        name: "SDWAN 路由器",
        parent_id: "net",
        display_key: "mac",
        print_preset_ids: [],
      }),
    )
    // Choosing which number to show renumbers nothing on its own.
    expect(post).not.toHaveBeenCalled()
  })

})

// The preset is opaque here: what it contains is the print service's business,
// and an installation without one should not be asked about it at all.
describe("Category print preset", () => {
  // A category has more than one label -- a permanent number, a location tag
  // replaced whenever it moves -- so this is a set, ticked by name.
  it("saves the labels this category can print", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await user.click(await categoryRow())

    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByLabelText("路由器标签"))
    await user.click(within(dialog).getByLabelText("交换机标签"))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/categories/rt", {
        name: "SDWAN 路由器",
        parent_id: "net",
        display_key: "",
        print_preset_ids: ["preset-rt", "preset-sw"],
      }),
    )
  })

  it("does not ask for one when nothing can print", async () => {
    get.mockImplementation((p: string) =>
      p === "/capabilities" ? Promise.resolve({ printing: false }) : route(p),
    )
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await user.click(await categoryRow())

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByLabelText("路由器标签")).not.toBeInTheDocument()
  })
})
