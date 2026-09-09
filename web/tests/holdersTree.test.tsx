import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Holders } from "@/routes/Holders"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { HolderEntity } from "@/lib/types"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn(),
    },
  }
})

const AT = { path: ["/holders", "/holders/:id"] as string[] }

function holder(over: Partial<HolderEntity> & { id: string; name: string }): HolderEntity {
  return {
    type: "location",
    parent_id: null,
    note: "",
    is_default_stock: false,
    ...over,
  }
}

/** A company with n locations under it, plus a second root to page against. */
function wide(n: number): HolderEntity[] {
  return [
    holder({ id: "co", name: "国药集团", type: "company" }),
    ...Array.from({ length: n }, (_, i) =>
      holder({ id: `l${i}`, name: `位置 ${String(i).padStart(2, "0")}`, parent_id: "co" }),
    ),
  ]
}

/** `n` parentless locations -- one page of roots is twelve. */
function manyRoots(n: number): HolderEntity[] {
  return Array.from({ length: n }, (_, i) =>
    holder({ id: `r${String(i).padStart(2, "0")}`, name: `仓库 ${String(i).padStart(2, "0")}` }),
  ).concat(
    // A child on the last root, so a page boundary has something to cut.
    holder({ id: "kid", name: "货架区", parent_id: `r${String(n - 1).padStart(2, "0")}` }),
  )
}

function serve(list: HolderEntity[], counts: Record<string, number> = {}) {
  return (p: string) => {
    if (p === "/holders/counts") return Promise.resolve(counts)
    if (/^\/holders\/.+\/usage$/.test(p)) {
      return Promise.resolve({ assets: 0, children: 0, history: 0 })
    }
    if (p.startsWith("/holders")) return Promise.resolve(list)
    return Promise.resolve([])
  }
}

/** The rail's rows, in order, by their text. */
async function rowTexts() {
  const rail = await screen.findByRole("list")
  return within(rail)
    .getAllByRole("listitem")
    .map((li) => li.textContent ?? "")
}

beforeEach(() => {
  get.mockReset()
})

describe("持有方左栏的分页与折叠", () => {
  /*
   * The trap 014 decision 91 wrote down, in a rail.
   *
   * Paging the flattened rows lets page two open with a child whose parent was
   * the last row of page one, and an indented line under nothing claims a
   * place that is not on screen. Pages are therefore N roots and everything
   * beneath them, which is why the page sizes are uneven.
   */
  it("按根分页：翻页后每一行的父都还在同一页上", async () => {
    const user = userEvent.setup()
    const list = manyRoots(14)
    get.mockImplementation(serve(list))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    // Twelve roots on page one; the thirteenth and its child are not here yet.
    await waitFor(async () => expect(await rowTexts()).toHaveLength(12))
    expect(screen.queryByText(/货架区/)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "下一页" }))

    const page2 = await rowTexts()
    // The last root, its sibling, and the child -- the child's parent is here
    // with it rather than stranded on the previous page.
    expect(page2.some((t) => t.includes("货架区"))).toBe(true)
    expect(page2.some((t) => t.includes("仓库 13"))).toBe(true)
  })

  it("一页放得下就不画翻页条", async () => {
    get.mockImplementation(serve(manyRoots(3)))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await screen.findByRole("link", { name: /仓库 00/ })
    expect(screen.queryByRole("button", { name: "下一页" })).not.toBeInTheDocument()
  })

  /*
   * Folding is conditional, and that is the whole reason it is allowed here.
   *
   * 024 removed folding outright and CollapsibleTree was deleted for it before
   * that; both times the objection was a control that hides half the answer to
   * "what is there". A node only folds once its children would fill the rail
   * on their own, and the row says how many are behind it -- so the reader
   * knows what they are not being shown.
   */
  it("子项超过阈值的节点默认折起，并说出有多少个", async () => {
    const user = userEvent.setup()
    get.mockImplementation(serve(wide(15)))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await screen.findByRole("link", { name: /国药集团/ })
    expect(await rowTexts()).toHaveLength(1)

    // The count is on the control, not in the row's number slot -- that slot
    // means devices here, and it cannot say two things at once. What matters
    // is that the reader is told what they are not being shown.
    const control = screen.getByRole("button", { name: "展开 15 个" })
    await user.click(control)
    await waitFor(async () => expect(await rowTexts()).toHaveLength(16))
  })

  it("小节点默认展开，且没有子项的行不画三角", async () => {
    get.mockImplementation(serve(wide(3)))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await screen.findByRole("link", { name: /国药集团/ })
    expect(await rowTexts()).toHaveLength(4)
    // One control, on the company; the three locations have nothing to hide.
    expect(screen.getAllByRole("button", { name: /展开|折叠/ })).toHaveLength(1)
  })
})

describe("持有方左栏的搜索", () => {
  // Searching cannot keep the indent: showing only the hits removes the
  // parents the indent was measured against. The path answers the same
  // question -- and here it earns it twice over, because two companies can
  // each have a 三楼实验室.
  it("一搜就平展，命中行写出完整路径", async () => {
    const user = userEvent.setup()
    get.mockImplementation(
      serve([
        holder({ id: "co", name: "国药集团", type: "company" }),
        holder({ id: "dp", name: "研发部", type: "department", parent_id: "co" }),
        holder({ id: "lab", name: "三楼实验室", parent_id: "dp" }),
      ]),
    )
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await user.type(await screen.findByLabelText("名称、备注"), "实验室")

    await waitFor(async () => expect(await rowTexts()).toHaveLength(1))
    expect((await rowTexts())[0]).toContain("国药集团 / 研发部 / 三楼实验室")
    // Flat while searching: no fold controls to measure an indent against.
    expect(screen.queryByRole("button", { name: /展开|折叠/ })).not.toBeInTheDocument()
  })

  it("搜索词写进地址", async () => {
    const user = userEvent.setup()
    get.mockImplementation(serve(manyRoots(3)))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await user.type(await screen.findByLabelText("名称、备注"), "仓库 01")
    await waitFor(async () => expect(await rowTexts()).toHaveLength(1))
  })
})

describe("持有方的选中", () => {
  it("点一行就写进地址，右栏跟着换", async () => {
    const user = userEvent.setup()
    get.mockImplementation(serve(manyRoots(3)))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await user.click(await screen.findByRole("link", { name: /^仓库 01/ }))
    expect(await screen.findByRole("heading", { name: "仓库 01" })).toBeInTheDocument()
  })

  // A stale link and the front door are two different situations, and the
  // reader has to be able to tell them apart -- one of them means somebody
  // deleted the thing you were sent to.
  it("地址里的 id 不存在时，说的是「找不到」而不是「还没有」", async () => {
    get.mockImplementation(serve(manyRoots(3)))
    renderWithProviders(<Holders />, { route: "/holders/gone", ...AT })

    expect(await screen.findByText("找不到这个持有方")).toBeInTheDocument()
    expect(screen.queryByText("还没有任何持有方")).not.toBeInTheDocument()
  })

  it("一个持有方都没有时，右栏不重复左栏已经说过的话", async () => {
    get.mockImplementation(serve([]))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    // Said once, in the rail, where the way out is.
    expect(await screen.findAllByText("还没有任何持有方")).toHaveLength(1)
  })

  // The selection is an id, not "row n of the current page": paging it out of
  // view must not make the pane declare it missing.
  it("选中项翻到别页去了，右栏仍然显示它", async () => {
    const user = userEvent.setup()
    get.mockImplementation(serve(manyRoots(14)))
    renderWithProviders(<Holders />, { route: "/holders/r00", ...AT })

    expect(await screen.findByRole("heading", { name: "仓库 00" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "下一页" }))

    // Off the visible page, still the thing being read.
    expect(screen.getByRole("heading", { name: "仓库 00" })).toBeInTheDocument()
  })
})

describe("持有方右栏", () => {
  const list = [
    holder({ id: "co", name: "国药集团", type: "company", note: "总部" }),
    holder({ id: "sh", name: "上海仓库", parent_id: "co", note: "B 座三层" }),
  ]

  // 025 deleted the model's note along with its test and nobody noticed until
  // it was reported. This is that guard, on the page it would happen to next.
  it("备注写出来", async () => {
    get.mockImplementation(serve(list))
    renderWithProviders(<Holders />, { route: "/holders/sh", ...AT })

    expect(await screen.findByText("B 座三层")).toBeInTheDocument()
  })

  // Moving the selection is what the rail is for; a second way to do it inside
  // the pane would be a second thing to keep in step (024 decision 8).
  it("上级只是个名字，不是链接", async () => {
    get.mockImplementation(serve(list))
    renderWithProviders(<Holders />, { route: "/holders/sh", ...AT })

    await screen.findByRole("heading", { name: "上海仓库" })
    expect(screen.queryByRole("link", { name: "国药集团" })).not.toBeInTheDocument()
  })

  it("没有 holder.create 时，新建被禁用并说出缺什么", async () => {
    get.mockImplementation(serve(list))
    renderWithProviders(<Holders />, {
      route: "/holders",
      ...AT,
      permissions: ["holder.update"],
    })

    const create = await screen.findByRole("button", { name: /新建持有方/ })
    expect(create).toBeDisabled()
    expect(create.getAttribute("title")).toMatch(/新增持有方/)
  })

  it("没有 holder.update 时，修改被禁用并说出缺什么", async () => {
    get.mockImplementation(serve(list))
    renderWithProviders(<Holders />, {
      route: "/holders/sh",
      ...AT,
      permissions: ["holder.create"],
    })

    const edit = await screen.findByRole("button", { name: "编辑" })
    expect(edit).toBeDisabled()
    expect(edit.getAttribute("title")).toMatch(/修改持有方/)
  })
})

describe("持有方的用量不再逐行预取", () => {
  /*
   * The page used to ask /holders/{id}/usage for every holder at load, so that
   * a delete confirmation could be ready before anybody reached for it -- N
   * requests for a button that is mostly never pressed, all answering with
   * numbers from the moment the page opened.
   */
  it("打开页面时一条 usage 都不问", async () => {
    get.mockImplementation(serve(manyRoots(5)))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await screen.findByRole("link", { name: /仓库 00/ })
    const asked = get.mock.calls.map((c) => String(c[0]))
    expect(asked.filter((p) => p.endsWith("/usage"))).toHaveLength(0)
    // One batched count instead.
    expect(asked.filter((p) => p === "/holders/counts")).toHaveLength(1)
  })

  it("点删除时才问那一个", async () => {
    const user = userEvent.setup()
    get.mockImplementation(serve(manyRoots(3)))
    renderWithProviders(<Holders />, { route: "/holders/r00", ...AT })

    await user.click(await screen.findByRole("button", { name: "编辑" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "删除" }))

    await waitFor(() =>
      expect(get.mock.calls.map((c) => String(c[0]))).toContain("/holders/r00/usage"),
    )
  })
})
