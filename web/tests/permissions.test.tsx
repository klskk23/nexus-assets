import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Assets } from "@/routes/Assets"
import { Models } from "@/routes/Models"
import { Roles } from "@/routes/Roles"
import { AppShell } from "@/routes/AppShell"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { openMenu } from "@/test/menu"

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => vi.fn() }
})

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
]
const roles = {
  items: [
    { id: "role-admin", name: "管理员", is_admin: true, permissions: [], users: 2 },
    {
      id: "role-user",
      name: "普通用户",
      is_admin: false,
      permissions: ["asset.create", "transfer.create", "print", "export"],
      users: 3,
    },
  ],
  total: 2,
  offset: 0,
  limit: 50,
}
const page = {
  items: [
    {
      id: "a1",
      display_name: "112394521950",
      category_id: "net",
      model_id: null,
      status: "in_stock",
      owner: { id: "u1", name: "管理员" },
      holder: { type: "entity", id: "loc", name: "上海仓库" },
      attrs: {},
      note: "",
      version: 1,
      created_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
  ],
  total: 1,
  offset: 0,
  limit: 50,
}

function route(p: string) {
  const st = statusRoute(p)
  if (st) return st
  if (p === "/categories") return Promise.resolve(categories)
  if (p === "/roles") return Promise.resolve(roles)
  if (p === "/capabilities") return Promise.resolve({ printing: true })
  if (p === "/models") return Promise.resolve([])
  if (p === "/users" || p === "/holders") return Promise.resolve([])
  if (p.startsWith("/assets")) return Promise.resolve(page)
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  localStorage.clear()
})

// The rule the whole interface follows: a control somebody may not use is
// disabled and says what it needs -- not hidden. Hiding it makes "why can't I"
// a question only a colleague can answer.
describe("what a role without permissions sees", () => {
  const ordinary = ["asset.create", "transfer.create", "print", "export"]

  it("disables the buttons it may not press, and explains", async () => {
    renderWithProviders(<Assets />, { permissions: ["export"] })
    await screen.findByText(/共 1 条/)

    const create = screen.getByRole("button", { name: "录入设备" })
    expect(create).toBeDisabled()
    expect(create).toHaveAttribute("title", expect.stringContaining("录入设备"))

    // And leaves the ones it may alone.
    expect(screen.getByRole("button", { name: "导出 CSV" })).toBeEnabled()
  })

  it("leaves reading alone", async () => {
    renderWithProviders(<Assets />, { permissions: [] })
    // The list is the point of the ledger: it is open to anyone signed in.
    expect(await screen.findByText(/共 1 条/)).toBeInTheDocument()
    expect(screen.getByRole("row", { name: /112394521950/ })).toBeInTheDocument()
  })

  it("disables the row actions rather than dropping them", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />, { permissions: ordinary })
    const row = await screen.findByRole("row", { name: /112394521950/ })
    await openMenu(user, row)

    // Ordinary users transfer and print, but do not delete.
    expect(await screen.findByRole("menuitem", { name: "删除" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    expect(screen.getByRole("menuitem", { name: "打印标签" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })

  it("disables creating on a metadata page", async () => {
    renderWithProviders(<Models />, { permissions: ordinary })
    const create = await screen.findByRole("button", { name: "新建型号" })
    expect(create).toBeDisabled()
    expect(create).toHaveAttribute("title", expect.stringContaining("管理型号"))
  })
})

// Only the audit log is hidden outright: there is nothing on that page a
// reader without the permission may see, so an entry that always answers 403
// is worse than no entry.
describe("the navigation", () => {
  it("hides the audit log without the permission, and shows it with", async () => {
    const { unmount } = renderWithProviders(<AppShell />, { permissions: ["export"] })
    await waitFor(() => expect(screen.getByRole("link", { name: "资产" })).toBeInTheDocument())
    expect(screen.queryByRole("link", { name: "审计" })).not.toBeInTheDocument()

    unmount()
    renderWithProviders(<AppShell />, { permissions: ["audit.read"] })
    await waitFor(() => expect(screen.getByRole("link", { name: "审计" })).toBeInTheDocument())
  })
})

describe("the roles page", () => {
  it("shows what each role carries, and how many are on it", async () => {
    renderWithProviders(<Roles />)
    expect(await screen.findByRole("row", { name: /管理员/ })).toHaveTextContent("全部权限")
    expect(screen.getByRole("row", { name: /普通用户/ })).toHaveTextContent("4 项")
  })

  // The administrator is not eighteen ticks that happen to be on: it means
  // everything, including permissions a later version adds. So there is
  // nothing to clear, and the editor says so instead of showing boxes.
  it("offers no switches on the administrator", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Roles />)
    await user.click(await screen.findByRole("row", { name: /管理员/ }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/不是一组勾选/)).toBeInTheDocument()
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument()
    // The name is editable.
    expect(within(dialog).getByLabelText("名称")).toBeEnabled()
  })

  it("edits the switches on an ordinary role", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Roles />)
    await user.click(await screen.findByRole("row", { name: /普通用户/ }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("checkbox", { name: "录入设备" })).toBeChecked()
    expect(within(dialog).getByRole("checkbox", { name: "删除设备" })).not.toBeChecked()

    await user.click(within(dialog).getByRole("checkbox", { name: "删除设备" }))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/roles/role-user",
        expect.objectContaining({
          permissions: expect.arrayContaining(["asset.delete"]),
        }),
      ),
    )
  })

  it("will not delete a role people are still on", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Roles />)
    const row = await screen.findByRole("row", { name: /普通用户/ })
    await openMenu(user, row)

    expect(await screen.findByRole("menuitem", { name: "删除角色" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })
})
