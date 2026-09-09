import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Holders } from "@/routes/Holders"
import { renderWithProviders } from "@/test/renderWithProviders"
import { choose } from "@/test/choose"
import type { HolderEntity } from "@/lib/types"

/*
 * 028 turned this page from a table into a rail beside a pane, so every
 * assertion below had to move. **Nothing was dropped without saying so** --
 * 025 rewrote a test file and deleted a feature's only guard along with it,
 * and nobody noticed until it was reported. The old file's twelve assertions
 * are accounted for here or in holdersDefaultStock.test.tsx, and the three
 * that genuinely stopped applying say why at the point where they used to be.
 */

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

const company: HolderEntity = {
  id: "co", type: "company", name: "XX 集团",
  parent_id: null, note: "总部", is_default_stock: false,
}
const dept: HolderEntity = {
  id: "dp", type: "department", name: "运维部",
  parent_id: "co", note: "", is_default_stock: false,
}
const warehouse: HolderEntity = {
  id: "wh", type: "location", name: "上海仓库",
  parent_id: "dp", note: "B 座三层，A01–A24 号货架", is_default_stock: true,
}

const noUsage = { assets: 0, children: 0, history: 0 }

export function serveHolders(
  list: HolderEntity[],
  usage: Record<string, typeof noUsage> = {},
  counts: Record<string, number> = {},
) {
  return (p: string) => {
    const m = /^\/holders\/(.+)\/usage$/.exec(p)
    if (m) return Promise.resolve(usage[m[1]] ?? noUsage)
    if (p === "/holders/counts") return Promise.resolve(counts)
    if (p.startsWith("/holders")) return Promise.resolve(list)
    return Promise.resolve([])
  }
}

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /新建持有方/ }))
  return screen.findByRole("dialog")
}

/**
 * Opens one holder's pane by clicking its row in the rail.
 *
 * Anchored with ^ because the page header carries a second link to the same
 * name -- 「默认库存点：上海仓库」 -- and a loose match finds both. The row's
 * accessible name is the label followed by its count.
 */
async function select(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("link", { name: new RegExp(`^${name}`) }))
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await select(user, name)
  await user.click(await screen.findByRole("button", { name: "编辑" }))
  return screen.findByRole("dialog")
}

beforeEach(() => {
  get.mockReset().mockImplementation(serveHolders([company, dept, warehouse]))
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

describe("Holders hierarchy and notes", () => {
  // Was: "shows each holder's parent and note" -- both were table columns.
  // The parent is now a fact in the pane and the note is its own block, so the
  // same two claims are made about the selected holder instead of about a row.
  it("选中一个持有方，右栏说出它的上级与备注", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    await select(user, "上海仓库")
    // Scoped to the pane: 运维部 is also a row in the rail, and finding it
    // there would pass without the pane ever saying who the parent is.
    const pane = (await screen.findByRole("heading", { name: "上海仓库" })).closest("div")!
      .parentElement!
    expect(within(pane).getByText("运维部")).toBeInTheDocument()
    expect(within(pane).getByText(/A01–A24/)).toBeInTheDocument()
  })

  // The half of the old assertion about a parentless holder.
  it("没有上级的持有方，右栏写「无上级」", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    await select(user, "XX 集团")
    expect(await screen.findByText("无上级")).toBeInTheDocument()
  })

  // The tree is the point of the round: the shape is the picture, not a column
  // somebody has to assemble twenty rows into.
  it("画出层级：公司在根上，部门与位置缩进在下面", async () => {
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    const rows = await screen.findAllByRole("listitem")
    const names = rows.map((r) => r.textContent ?? "")
    expect(names[0]).toContain("XX 集团")
    expect(names[1]).toContain("运维部")
    expect(names[2]).toContain("上海仓库")

    // The kind is said on the row, because a company and a location can both
    // be roots and position alone cannot tell them apart.
    expect(names[0]).toContain("公司")
    expect(names[2]).toContain("位置")
  })

  it("creates a location with an optional parent and a note", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })
    const dialog = await openCreate(user)

    await user.type(within(dialog).getByLabelText("名称"), "北京仓库")
    await choose(user, within(dialog).getByLabelText("上级"), /XX 集团/)
    await user.type(within(dialog).getByLabelText("备注"), "二号库")
    await user.click(within(dialog).getByRole("button", { name: "新建持有方" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/holders", {
        type: "location", name: "北京仓库", note: "二号库", parent_id: "co",
      }),
    )
  })

  it("lets a location stand on its own", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })
    const dialog = await openCreate(user)

    await user.type(within(dialog).getByLabelText("名称"), "第三方仓")
    await user.click(within(dialog).getByRole("button", { name: "新建持有方" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/holders", {
        type: "location", name: "第三方仓", note: "", parent_id: null,
      }),
    )
  })

  // A department is always somebody's department, so the form does not let you
  // compose one that the server is going to refuse.
  it("requires a company for a department and offers no way around it", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })
    const dialog = await openCreate(user)

    await choose(user, within(dialog).getByLabelText("类型"), "部门")
    expect(within(dialog).getByText(/部门必须属于一个公司/)).toBeInTheDocument()

    const submit = within(dialog).getByRole("button", { name: "新建持有方" })
    expect(submit).toBeDisabled()

    await user.click(within(dialog).getByLabelText("上级"))
    expect(screen.queryByRole("option", { name: "无上级" })).not.toBeInTheDocument()
    // Only companies are eligible; the warehouse must not be on offer.
    expect(screen.queryByRole("option", { name: /上海仓库/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole("option", { name: /XX 集团/ }))

    await user.type(within(dialog).getByLabelText("名称"), "网络部")
    expect(within(dialog).getByRole("button", { name: "新建持有方" })).toBeEnabled()
  })

  // With no company on file the option is shown and disabled: "why is 部门 not
  // in the list" is a worse question than a greyed row with a reason under it.
  it("disables the department option until a company exists", async () => {
    const user = userEvent.setup()
    get.mockImplementation(serveHolders([warehouse]))
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })
    const dialog = await openCreate(user)

    await user.click(within(dialog).getByLabelText("类型"))
    const option = await screen.findByRole("option", { name: "部门" })
    expect(option).toHaveAttribute("aria-disabled", "true")
  })
})

describe("Holders edit and delete", () => {
  it("edits a holder's name, parent and note in one dialog", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    const dialog = await openEditor(user, "上海仓库")
    const name = within(dialog).getByLabelText("名称")
    await user.clear(name)
    await user.type(name, "上海一号仓")
    await choose(user, within(dialog).getByLabelText("上级"), /XX 集团/)
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/holders/wh", {
        name: "上海一号仓",
        note: "B 座三层，A01–A24 号货架",
        parent_id: "co",
        // No is_default_stock any more. The old body carried it along because
        // the tick box lived in this dialog; it is a button in the pane now,
        // for its own permission, so a rename no longer touches the marker at
        // all. Asserted as an exact object so re-adding it would fail here.
      }),
    )
  })

  // Detaching has to be sayable, and it travels as an explicit null -- an
  // absent field means "leave the parent alone".
  it("can clear a location's parent", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    const dialog = await openEditor(user, "上海仓库")
    await choose(user, within(dialog).getByLabelText("上级"), "无上级")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/holders/wh", expect.objectContaining({ parent_id: null })),
    )
  })

  // Was reached from a row's context menu. The rail has no menu now -- delete
  // lives in the editor, the way it does on the categories page, because
  // selection changes with one click on the rail and a destructive control on
  // a pane that swaps that easily is a worse trade than one extra click.
  it("deletes only after the name has been typed out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    const dialog = await openEditor(user, "运维部")
    await user.click(within(dialog).getByRole("button", { name: "删除" }))

    const confirmDialog = await screen.findByRole("alertdialog")
    const confirm = within(confirmDialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()

    await user.type(within(confirmDialog).getByRole("textbox"), "运维部")
    await user.click(confirm)
    await waitFor(() => expect(del).toHaveBeenCalledWith("/holders/dp"))
  })

  // History does not refuse, so the dialog has to say what it costs instead.
  it("states how many events mention a holder before it is deleted", async () => {
    const user = userEvent.setup()
    get.mockImplementation(
      serveHolders([company, dept, warehouse], { wh: { assets: 0, children: 0, history: 7 } }),
    )
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    const dialog = await openEditor(user, "上海仓库")
    await user.click(within(dialog).getByRole("button", { name: "删除" }))

    expect(await screen.findByText(/7 条流转记录/)).toBeInTheDocument()
  })

  // Was "surfaces a refusal above the table". There is no table and no second
  // place for a refusal to land: deleting and saving are both in this dialog,
  // so the server has one place to say no instead of two pieces of state
  // rendering the same answer.
  it("拒绝就显示在同一个对话框里", async () => {
    const user = userEvent.setup()
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
    del.mockRejectedValue(
      new ApiError(409, "reference_blocked", "「XX 集团」下还有 1 个下级，请先移走或删除它们"),
    )
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    const dialog = await openEditor(user, "XX 集团")
    await user.click(within(dialog).getByRole("button", { name: "删除" }))
    const confirmDialog = await screen.findByRole("alertdialog")
    await user.type(within(confirmDialog).getByRole("textbox"), "XX 集团")
    await user.click(within(confirmDialog).getByRole("button", { name: "删除" }))

    expect(await screen.findByText(/还有 1 个下级/)).toBeInTheDocument()
  })

  // Was implicit in "the row is the control": the rail's rows are links, and
  // there is nothing behind a right-click on them any more.
  it("树上没有右键菜单", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", path: ["/holders", "/holders/:id"] })

    const row = await screen.findByRole("link", { name: /^上海仓库/ })
    await user.pointer({ target: row, keys: "[MouseRight]" })
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })
})

/*
 * Moved out of this file, not deleted:
 *
 * - "is set in the editor, and is not a row action" -- the marker left the
 *   editor in 028. It is a button in the pane now, because holder.default_stock
 *   is its own permission and sharing an entrance with holder.update meant
 *   somebody could tick it, save, and only then be refused. Its replacements
 *   live in holdersDefaultStock.test.tsx.
 * - "is absent on a holder that could never hold it" -- same file. The button
 *   is disabled with the reason rather than absent, which is what the create
 *   dialog already does with 部门 when there is no company.
 */
