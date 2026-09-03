import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Users } from "@/routes/Users"
import { renderWithProviders } from "@/test/renderWithProviders"
import { listed } from "@/test/listing"
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

const users = [
  { id: "u1", email: "admin@example.com", name: "管理员", auth_type: "local", status: "active", role_id: "role-admin" },
  { id: "u2", email: "old@example.com", name: "离职同事", auth_type: "local", status: "disabled", role_id: "role-user" },
  { id: "u3", email: "sso@example.com", name: "外部同事", auth_type: "oidc", status: "active", role_id: "role-user" },
]

const roles = {
  items: [
    { id: "role-admin", name: "管理员", is_admin: true, permissions: [], users: 1 },
    { id: "role-user", name: "普通用户", is_admin: false, permissions: ["asset.create"], users: 2 },
  ],
  total: 2,
  offset: 0,
  limit: 20,
}

function route(p: string) {
  if (p.startsWith("/roles")) return Promise.resolve(roles)
  if (p.startsWith("/users")) return Promise.resolve(listed(users, p))
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
})

/** Opens one account's editor by clicking its row, the way the page intends. */
async function openEditor(user: ReturnType<typeof userEvent.setup>, email: string) {
  const row = await screen.findByRole("row", { name: new RegExp(email) })
  await user.click(within(row).getAllByRole("cell")[0])
  return screen.findByRole("dialog")
}

describe("the account editor", () => {
  it("opens from the row and offers the name and the role", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)

    const dialog = await openEditor(user, "old@example.com")
    expect(within(dialog).getByLabelText("姓名")).toHaveValue("离职同事")
    // Read-only rather than absent: it is what identifies this row.
    expect(within(dialog).getByLabelText("邮箱")).toBeDisabled()
  })

  it("renames an account", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)

    const dialog = await openEditor(user, "old@example.com")
    const name = within(dialog).getByLabelText("姓名")
    await user.clear(name)
    await user.type(name, "回来了")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/u2", { name: "回来了" }))
  })

  // Disabling was one-way in the interface: an account stopped by a misclick
  // could only be revived in the database.
  it("puts a disabled account back into service without asking for a phrase", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)

    const dialog = await openEditor(user, "old@example.com")
    await user.click(within(dialog).getByRole("button", { name: "启用" }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/u2", { disable: false }))
  })

  it("asks for the email before disabling, since that one is not a misclick away", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)

    const dialog = await openEditor(user, "admin@example.com")
    await user.click(within(dialog).getByRole("button", { name: "停用" }))

    const confirm = await screen.findByRole("alertdialog")
    await user.type(within(confirm).getByRole("textbox"), "admin@example.com")
    await user.click(within(confirm).getByRole("button", { name: "停用" }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/u1", { disable: true }))
  })

  it("resets a password only after the email has been typed out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)

    const dialog = await openEditor(user, "old@example.com")
    await user.type(within(dialog).getByLabelText("新密码"), "another-horse")
    await user.click(within(dialog).getByRole("button", { name: "重置密码" }))

    const confirm = await screen.findByRole("alertdialog")
    await user.type(within(confirm).getByRole("textbox"), "old@example.com")
    await user.click(within(confirm).getByRole("button", { name: "重置密码" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/users/u2/password", { password: "another-horse" }),
    )
    // Saying so matters: the reset ends every session that account had, and
    // nothing else on screen would show that it did.
    expect(await within(await screen.findByRole("dialog")).findByRole("status")).toHaveTextContent(
      "登录已全部失效",
    )
  })

  // An SSO account has no password to reset, and hiding the control would make
  // "why can't I" a question only a colleague can answer.
  it("disables the reset on an SSO account and says why", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Users />)

    const dialog = await openEditor(user, "sso@example.com")
    expect(within(dialog).getByLabelText("新密码")).toBeDisabled()
    expect(
      within(dialog).getByText("该账号用单点登录，没有可重置的密码。"),
    ).toBeInTheDocument()
  })

  // The page behind is aria-hidden and covered, so a refusal out there reaches
  // nobody.
  it("shows a refusal inside the dialog", async () => {
    patch.mockRejectedValue(
      new ApiError(409, "reference_blocked", "该账号仍是 15 台设备的负责人"),
    )
    const user = userEvent.setup()
    renderWithProviders(<Users />)

    const dialog = await openEditor(user, "admin@example.com")
    await user.click(within(dialog).getByRole("button", { name: "停用" }))
    const confirm = await screen.findByRole("alertdialog")
    await user.type(within(confirm).getByRole("textbox"), "admin@example.com")
    await user.click(within(confirm).getByRole("button", { name: "停用" }))

    expect(await within(await screen.findByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "15 台设备",
    )
  })
})
