import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Users } from "@/routes/Users"
import { Categories } from "@/routes/Categories"
import { Audit } from "@/routes/Audit"
import { renderWithProviders } from "@/test/renderWithProviders"
import { listed } from "@/test/listing"
import { chooseByLabel } from "@/test/choose"
import { useLocation } from "react-router"
import type { User } from "@/lib/types"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    },
  }
})

/**
 * The exemplar is the accounts page, not holders.
 *
 * Holders used to stand in for "every table page" here. 028 turned it into a
 * master-detail rail, so it no longer borrows the shape this file is about --
 * and a guard whose subject has stopped being an example of the thing has to
 * change subject, not be deleted. Accounts is the closest match: search, two
 * filters, paging, all through CrudPage.
 */
const users: User[] = [
  { id: "u1", email: "wang@example.com", name: "王五", auth_type: "local", status: "active", role_id: "r1" },
  { id: "u2", email: "zhao@example.com", name: "赵六", auth_type: "local", status: "active", role_id: "r1" },
  { id: "u3", email: "sun@example.com", name: "孙七", auth_type: "oidc", status: "disabled", role_id: "r2" },
]

const roles = [
  { id: "r1", name: "管理员", is_admin: true, permissions: [] },
  { id: "r2", name: "仓管", is_admin: false, permissions: [] },
]

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: "net", path: "/net/rt/", display_key: "" },
]

function route(p: string) {
  if (p.startsWith("/users")) return Promise.resolve(listed(users, p))
  if (p.startsWith("/roles")) return Promise.resolve({ items: roles, total: roles.length, offset: 0, limit: 50 })
  if (p.startsWith("/categories")) return Promise.resolve(categories)
  if (p.startsWith("/audit")) return Promise.resolve({ items: [], total: 0, offset: 0, limit: 20 })
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
})

/** Shows the address the router is on, which is where list state belongs. */
function Address() {
  const location = useLocation()
  return <output data-testid="address">{location.search}</output>
}

/** The paths a metadata list was asked for, newest last. */
const asked = (prefix: string) =>
  get.mock.calls.map((call) => String(call[0])).filter((p) => p.startsWith(prefix))

describe("every table page searches, filters and pages the same way", () => {
  it("sends what was typed in the search box to the server", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)
    await screen.findByRole("row", { name: /王五/ })

    // The box says what it searches rather than just "搜索" -- a page that
    // searches emails and names should not have to be guessed at.
    await user.type(screen.getByLabelText("邮箱、姓名"), "赵")

    await waitFor(() => expect(asked("/users?").at(-1)).toContain("q=%E8%B5%B5"))
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /王五/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole("row", { name: /赵六/ })).toBeInTheDocument()
  })

  it("narrows by a filter and puts it in the address", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <Users />
        <Address />
      </>,
    )
    await screen.findByRole("row", { name: /王五/ })

    await chooseByLabel(user, "状态", "已停用")

    await waitFor(() => expect(asked("/users?").at(-1)).toContain("status=disabled"))
    // In the address, so opening an account and coming back finds the same
    // question rather than the whole list again.
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent("status=disabled"),
    )
  })

  it("draws no paging controls for a list that fits on one page", async () => {
    renderWithProviders(<Users />)
    await screen.findByRole("row", { name: /王五/ })

    expect(screen.queryByRole("button", { name: "上一页" })).not.toBeInTheDocument()
    // The count stays: "how many are there" is a question a short list has too.
    expect(screen.getByLabelText(/共 3 条/)).toBeInTheDocument()
  })
})

describe("the category tree", () => {
  // Rows rather than table rows now (024): the tree is the page's left rail.
  // What survives from 014 decision 91 is the reason -- showing only the hits
  // removes the parents the indent was measured against, so a match states its
  // whole path instead of claiming a position under nothing.
  it("flattens to full paths while searching, and goes back to a tree after", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />, { route: "/categories/rt", path: "/categories/:id" })
    await screen.findByRole("link", { name: /SDWAN 路由器/ })

    await user.type(screen.getByLabelText("名称、编码"), "SDWAN")

    expect(await screen.findByRole("link", { name: /网络设备 \/ SDWAN 路由器/ })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /^网络设备$/ })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText("名称、编码"))
    await screen.findByRole("link", { name: /^网络设备/ })
  })
})

describe("the audit log", () => {
  it("has the same search box as every other table", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Audit />)
    await waitFor(() => expect(asked("/audit").length).toBeGreaterThan(0))

    await user.type(screen.getByLabelText("操作人、对象编号"), "张三")

    await waitFor(() =>
      expect(asked("/audit").at(-1)).toContain("q=%E5%BC%A0%E4%B8%89"),
    )
  })
})

// Eight metadata pages are one component wearing eight sets of columns, and
// this is the shape they all borrow: a title, a way to narrow the list, the
// rows, and a pager under them.
//
// It is asserted once, here, because until now nothing said it in one place.
// Drop the pager while rearranging CrudPage and eight page tests go red at
// the same moment, with nothing to show that they are eight symptoms of one
// cause. This test is that cause, stated.
//
// Deliberately not a snapshot and deliberately not about classes: the claim is
// that the four parts are present and reachable, not how they are laid out.
// Whether they are 22px apart is a question for the screenshot walkthrough.
describe("the shape every metadata page borrows", () => {
  it("gives a title, a search box, rows and a pager -- all four, together", async () => {
    renderWithProviders(<Users />)

    expect(await screen.findByRole("heading", { level: 1, name: "账号" })).toBeInTheDocument()
    expect(screen.getByLabelText("邮箱、姓名")).toBeInTheDocument()
    expect(await screen.findByRole("row", { name: /王五/ })).toBeInTheDocument()

    // The range line is the part of the pager that is always there. Page links
    // and the per-page picker come and go with the row count, and a list of
    // three does not need either -- but "how many matched" is still the
    // question someone came to a filtered list to ask.
    expect(screen.getByLabelText("第 1–3 条，共 3 条")).toBeInTheDocument()
  })
})
