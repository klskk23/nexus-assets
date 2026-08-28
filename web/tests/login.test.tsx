import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Login } from "@/routes/Login"
import { AuthProvider } from "@/features/auth/useAuth"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate }
})

const post = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: vi.fn().mockResolvedValue({ id: "u1", name: "管理员" }),
      post: (...a: unknown[]) => post(...a),
      patch: vi.fn(),
      del: vi.fn(),
    },
    getToken: () => null,
    setToken: vi.fn(),
  }
})

function renderLogin() {
  return renderWithProviders(
    <AuthProvider>
      <Login />
    </AuthProvider>,
  )
}

describe("Login", () => {
  beforeEach(() => {
    navigate.mockReset()
    post.mockReset()
  })

  it("shows both sign-in routes", () => {
    renderLogin()
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "使用 Google 登录" })).toHaveAttribute(
      "href",
      "/api/auth/oidc/start",
    )
  })

  it("submits the credentials and lands on the overview", async () => {
    post.mockResolvedValue({ token: "t0k", user: { id: "u1", name: "管理员" } })
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText("邮箱"), "admin@example.com")
    await user.type(screen.getByLabelText("密码"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "登录" }))

    await waitFor(() => expect(post).toHaveBeenCalledWith("/auth/login", {
      email: "admin@example.com",
      password: "correct-horse",
    }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }))
  })

  it("surfaces the server message and stays put on a bad password", async () => {
    post.mockRejectedValue(new ApiError(401, "unauthenticated", "邮箱或密码不正确"))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText("邮箱"), "admin@example.com")
    await user.type(screen.getByLabelText("密码"), "wrong-one")
    await user.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码不正确")
    expect(navigate).not.toHaveBeenCalled()
  })

  it("requires both fields before it will submit", async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole("button", { name: "登录" }))
    expect(post).not.toHaveBeenCalled()
  })
})
