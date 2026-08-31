import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Holders } from "@/routes/Holders"
import { renderWithProviders } from "@/test/renderWithProviders"
import { choose } from "@/test/choose"
import type { HolderEntity } from "@/lib/types"

const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: vi.fn(),
      del: vi.fn(),
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

function serve(list: HolderEntity[]) {
  return (p: string) => Promise.resolve(p === "/holders" ? list : [])
}

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "新建持有方" }))
  return screen.findByRole("dialog")
}

beforeEach(() => {
  get.mockReset().mockImplementation(serve([company, dept, warehouse]))
  post.mockReset().mockResolvedValue({})
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
