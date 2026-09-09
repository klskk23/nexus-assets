import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { useLocation } from "react-router"

import { Categories } from "@/routes/Categories"
import { renderWithProviders } from "@/test/renderWithProviders"
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
  if (p === "/categories/counts") return Promise.resolve({ net: 5, rt: 3 })
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
      { id: "m1", category_ids: ["rt"], name: "X100", vendor_name: "Acme", attr_defaults: {} },
      { id: "m2", category_ids: ["net"], name: "别的机", vendor_name: "", attr_defaults: {} },
    ])
  }
  if (p.includes("/schema")) return Promise.resolve(schema)
  if (p.startsWith("/assets")) return Promise.resolve({ items: [], total: 3, offset: 0, limit: 1 })
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue(undefined)
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

/** The page, open on one category -- which is what the address names now. */
function openAt(id = "rt", opts: Record<string, unknown> = {}) {
  return renderWithProviders(<Categories />, {
    route: `/categories/${id}`,
    path: "/categories/:id",
    ...opts,
  })
}

/** Reads the router's own address -- MemoryRouter never touches window.location. */
function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}

/** The edit dialog, which is still where every change to a category happens. */
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "编辑类别" }))
  return screen.findByRole("dialog")
}


describe("Categories page", () => {
  // Binding moved to the field itself, so what a category shows is the set it
  // ends up with -- its own and its ancestors' -- and where to change it.
  it("lists the fields it has, read-only, and says where they are bound", async () => {
    const user = userEvent.setup()
    openAt()
    const dialog = await openEditor(user)
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
    openAt()
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

    expect(screen.queryByLabelText(/代号/)).not.toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText(/代号/)).toBeInTheDocument()
  })

  it("creates a category and closes", async () => {
    const user = userEvent.setup()
    openAt()
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

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
    openAt()
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

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
    openAt()
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

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
    openAt()
    await openEditor(user)
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
    openAt()
    await openEditor(user)
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
  openAt()
  await openEditor(user)
  await user.click(await screen.findByRole("button", { name: "删除类别" }))

  const dialog = await screen.findByRole("alertdialog")
  expect(dialog).toHaveTextContent("以下型号将不再关联到该类别")
  expect(dialog).toHaveTextContent("X100")
  // A model attached elsewhere is not this category's business.
  expect(dialog).not.toHaveTextContent("别的机")
})

// The tree is the page's left-hand rail now. Order and indent still carry the
// hierarchy -- a list cannot nest any more than a table could -- but nothing
// folds: categories are configuration, a few dozen at most, and a control that
// hides part of the answer to "what categories are there" costs more than it
// saves. This is the second time that idea has failed to pay for itself; the
// first took CollapsibleTree with it.
describe("类别树", () => {
  // The term lived in the address before, because useListQuery put it there as
  // a side effect of this being a list page. Dropping to useState would have
  // lost that with nothing failing: the search would simply stop surviving a
  // refresh or a pasted link.
  it("搜索词写进地址，且是 replace", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <Categories />
        <Where />
      </>,
      { route: "/categories/rt", path: "/categories/:id" },
    )
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

    await user.type(screen.getByLabelText("名称、编码"), "SDWAN")
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("q=SDWAN"))

    await user.clear(screen.getByLabelText("名称、编码"))
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("q="))
  })

  it("带 q 直接打开时，左栏已经是平展命中态", async () => {
    renderWithProviders(<Categories />, {
      route: "/categories/rt?q=SDWAN",
      path: "/categories/:id",
    })
    expect(await screen.findByRole("link", { name: /网络设备 \/ SDWAN 路由器/ })).toBeInTheDocument()
  })

  it("子类别排在父类别下面", async () => {
    openAt()
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

    const names = screen.getAllByRole("link").map((r) => r.textContent ?? "")
    expect(names[0]).toContain("网络设备")
    expect(names[1]).toContain("SDWAN 路由器")

    // The old right-click items are gone for good; folding is a control on
    // the row now, and only on rows that have something to hide.
    expect(screen.queryByText("折叠子类别")).not.toBeInTheDocument()
  })

  /**
   * Folding came back in 025, conditionally.
   *
   * 024 removed it and CollapsibleTree was deleted for it before that, both
   * times because a control that hides half the answer to "what categories are
   * there" costs more than it saves. What changed is the condition: only a
   * node whose children would fill the rail on their own starts closed, and
   * the row says how many are behind it -- so the reader knows what they are
   * not being shown, which is what both earlier attempts lacked.
   */
  it("小的父节点默认展开，且折叠控件只出现在有子类别的行上", async () => {
    openAt()
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

    // One child is nowhere near the threshold, so it stays open.
    const fold = screen.getAllByRole("button", { name: /折叠|展开/ })
    expect(fold).toHaveLength(1)
    expect(fold[0]).toHaveAttribute("aria-expanded", "true")
  })

  // The number is text inside the row, not a second destination: the row is
  // already the control, and a link inside a link is one click with two
  // answers.
  it("每一行都带子树设备数，0 也写出来", async () => {
    openAt()
    const row = await screen.findByRole("link", { name: /SDWAN 路由器/ })
    expect(row).toHaveTextContent("3")
    expect(within(row).queryByRole("link")).not.toBeInTheDocument()
  })

  it("新建类别在树的脚下，不在页头", async () => {
    const user = userEvent.setup()
    openAt()
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

    await user.click(screen.getByRole("button", { name: /新建类别/ }))
    const dialog = await screen.findByRole("dialog")
    // A category, not a child of whatever happens to be selected -- the parent
    // is a field on the form, so the button means one thing wherever you are.
    expect(within(dialog).getByRole("combobox", { name: "上级类别" })).toHaveTextContent(
      "无（作为顶层类别）",
    )
  })

  it("没有 schema.manage 时，新建被禁用并说出缺什么", async () => {
    openAt("rt", { permissions: [] })
    await screen.findByRole("link", { name: /SDWAN 路由器/ })
    const create = screen.getByRole("button", { name: /新建类别/ })
    expect(create).toBeDisabled()
    expect(create).toHaveAttribute("title", expect.stringContaining("管理类别与字段"))
  })
})

describe("改名与移动仍在对话框里", () => {
  it("改名、移动，且不把自己列为自己的上级", async () => {
    const user = userEvent.setup()
    openAt("net")
    const dialog = await openEditor(user)
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
    openAt()
    const dialog = await openEditor(user)
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
    openAt()
    const dialog = await openEditor(user)
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
    openAt()
    const dialog = await openEditor(user)
    expect(within(dialog).queryByLabelText("路由器标签")).not.toBeInTheDocument()
  })
})

// Where the selection lands when the tree changes under it. All three read the
// same from the code and differently on screen, which is what makes them worth
// a test rather than a careful read.
describe("选中的去向", () => {
  // Shown, not redirected to. Rewriting the address would take the tree off
  // the narrow screen for good: there the panes are two pages, and every route
  // into the list would land on a detail instead.
  it("地址没指定类别时，默认显示第一个根类别，地址保持 /categories", async () => {
    renderWithProviders(
      <>
        <Categories />
        <Where />
      </>,
      { route: "/categories", path: ["/categories", "/categories/:id"] },
    )
    expect(await screen.findByRole("heading", { name: "网络设备" })).toBeInTheDocument()
    expect(screen.getByTestId("where")).toHaveTextContent("/categories")
    expect(screen.getByTestId("where")).not.toHaveTextContent("/categories/net")
  })

  // Narrow screens only: the panes are two pages there, so the detail needs a
  // door back to the list. It points at the list's own address, so the
  // browser's Back agrees with it rather than competing.
  it("窄屏详情上有回到类别列表的入口", async () => {
    openAt()
    const back = await screen.findByRole("link", { name: "← 类别" })
    expect(back).toHaveAttribute("href", "/categories")
    expect(back).toHaveClass("md:hidden")
  })

  // Landing on a different category would answer a question nobody asked, and
  // the reader would never learn the link they followed is stale.
  it("地址指向不存在的类别：说出来，不悄悄换一个", async () => {
    renderWithProviders(<Categories />, {
      route: "/categories/gone",
      path: "/categories/:id",
    })
    expect(await screen.findByText("找不到这个类别")).toBeInTheDocument()
    expect(screen.queryByText("SDWAN 路由器")).toBeInTheDocument() // 树还在，可以另选
  })

  it("一个类别都没有时，右栏不画半页空的详情框架", async () => {
    get.mockImplementation((p: string) =>
      p === "/categories" ? Promise.resolve([]) : route(p),
    )
    renderWithProviders(<Categories />, {
      route: "/categories",
      path: ["/categories", "/categories/:id"],
    })

    // Once, in the rail that offers the way out of it -- not a second time
    // beside it in a detail pane with nothing to detail.
    expect(await screen.findAllByText("还没有任何类别")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "编辑类别" })).not.toBeInTheDocument()
  })
})

// The pane is a read, and switching what it reads costs one click on the left.
// A destructive control on something that changes that easily is a worse trade
// than the extra click it saves.
describe("右栏没有破坏性动作", () => {
  it("删除只在对话框里", async () => {
    openAt()
    await screen.findByRole("button", { name: "编辑类别" })
    expect(screen.queryByRole("button", { name: "删除类别" })).not.toBeInTheDocument()
  })

  it("没有 schema.manage 时，内容全可见但修改被禁用并说明", async () => {
    openAt("rt", { permissions: [] })
    const edit = await screen.findByRole("button", { name: "编辑类别" })
    expect(edit).toBeDisabled()
    expect(edit).toHaveAttribute("title", expect.stringContaining("管理类别与字段"))
    // Everything on the page is still readable -- this is not the audit's
    // "hidden rather than disabled" exception, whose premise is that there is
    // nothing on the page for such a reader to see.
    expect(await screen.findByRole("row", { name: /机柜/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "SDWAN 路由器" })).toBeInTheDocument()
  })
})
