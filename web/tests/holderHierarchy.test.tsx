import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Holders } from "@/routes/Holders"
import { renderWithProviders } from "@/test/renderWithProviders"
import { choose } from "@/test/choose"
import { chooseFromMenu, openMenu } from "@/test/menu"
import type { HolderEntity } from "@/lib/types"

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

function serve(list: HolderEntity[], usage: Record<string, typeof noUsage> = {}) {
  return (p: string) => {
    if (p === "/holders") return Promise.resolve(list)
    const m = /^\/holders\/(.+)\/usage$/.exec(p)
    if (m) return Promise.resolve(usage[m[1]] ?? noUsage)
    return Promise.resolve([])
  }
}

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "新建持有方" }))
  return screen.findByRole("dialog")
}

beforeEach(() => {
  get.mockReset().mockImplementation(serve([company, dept, warehouse]))
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

describe("Holders hierarchy and notes", () => {
  it("shows each holder's parent and note", async () => {
    renderWithProviders(<Holders />)

    // Addressed by row, because a name appears twice once it is also a parent.
    const dept = await screen.findByRole("row", { name: /运维部.*部门/ })
    expect(within(dept).getByText("XX 集团")).toBeInTheDocument()

    const wh = screen.getByRole("row", { name: /上海仓库/ })
    expect(within(wh).getByText("运维部")).toBeInTheDocument()
    expect(within(wh).getByText(/A01–A24/)).toBeInTheDocument()

    const co = screen.getByRole("row", { name: /XX 集团.*公司/ })
    expect(within(co).getByText("无上级")).toBeInTheDocument()
  })

  it("creates a location with an optional parent and a note", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)
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
    renderWithProviders(<Holders />)
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
    renderWithProviders(<Holders />)
    const dialog = await openCreate(user)

    await choose(user, within(dialog).getByLabelText("类型"), "部门")
    expect(within(dialog).getByText(/部门必须属于一个公司/)).toBeInTheDocument()

    // Submitting is not armed until a company is chosen.
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
    get.mockImplementation(serve([warehouse]))
    renderWithProviders(<Holders />)
    const dialog = await openCreate(user)

    await user.click(within(dialog).getByLabelText("类型"))
    const option = await screen.findByRole("option", { name: "部门" })
    expect(option).toHaveAttribute("aria-disabled", "true")
  })
})

describe("Holders edit and delete", () => {
  it("edits a holder's name, parent and note in one dialog", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    // The row is the control now, the same gesture the asset list uses.
    await user.click(await screen.findByRole("row", { name: /上海仓库/ }))

    const dialog = await screen.findByRole("dialog")
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
      }),
    )
  })

  // Detaching has to be sayable, and it travels as an explicit null -- an
  // absent field means "leave the parent alone".
  it("can clear a location's parent", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    await user.click(await screen.findByRole("row", { name: /上海仓库/ }))
    const dialog = await screen.findByRole("dialog")
    await choose(user, within(dialog).getByLabelText("上级"), "无上级")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/holders/wh", expect.objectContaining({ parent_id: null })),
    )
  })

  it("deletes only after the name has been typed out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    const row = await screen.findByRole("row", { name: /运维部.*部门/ })
    await chooseFromMenu(user, row, "删除")

    const dialog = await screen.findByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByRole("textbox"), "运维部")
    await user.click(confirm)
    await waitFor(() => expect(del).toHaveBeenCalledWith("/holders/dp"))
  })

  // History does not refuse, so the dialog has to say what it costs instead.
  it("states how many events mention a holder before it is deleted", async () => {
    const user = userEvent.setup()
    get.mockImplementation(
      serve([company, dept, warehouse], { wh: { assets: 0, children: 0, history: 7 } }),
    )
    renderWithProviders(<Holders />)

    const row = await screen.findByRole("row", { name: /上海仓库/ })
    await chooseFromMenu(user, row, "删除")

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("7 条流转记录")
  })

  it("surfaces a refusal above the table", async () => {
    const user = userEvent.setup()
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
    del.mockRejectedValue(
      new ApiError(409, "reference_blocked", "「XX 集团」下还有 1 个下级，请先移走或删除它们"),
    )
    renderWithProviders(<Holders />)

    const row = await screen.findByRole("row", { name: /XX 集团.*公司/ })
    await chooseFromMenu(user, row, "删除")
    const dialog = await screen.findByRole("alertdialog")
    await user.type(within(dialog).getByRole("textbox"), "XX 集团")
    await user.click(within(dialog).getByRole("button", { name: "删除" }))

    expect(await screen.findByText(/还有 1 个下级/)).toBeInTheDocument()
  })
})

describe("Holders context menu", () => {
  // The marker moves but never switches off, so the action is offered on
  // every location except the one that already has it.
  it("offers the default-stock action only where it could apply", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)

    const co = await screen.findByRole("row", { name: /XX 集团.*公司/ })
    await openMenu(user, co)
    expect(screen.getByRole("menuitem", { name: "设为默认库存点" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    await user.keyboard("{Escape}")

    const current = screen.getByRole("row", { name: /上海仓库/ })
    await openMenu(user, current)
    expect(screen.getByRole("menuitem", { name: "设为默认库存点" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })
})
