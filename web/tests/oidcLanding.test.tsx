import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router"

import { AppShell } from "@/routes/AppShell"
import { Login } from "@/routes/Login"
import { AuthProvider } from "@/features/auth/useAuth"
import { LanguageProvider } from "@/i18n/useLanguage"
import { ThemeProvider } from "@/features/theme/useTheme"
import { makeTestQueryClient } from "@/test/renderWithProviders"
import { setToken } from "@/lib/api"

// The real api client, over a stubbed fetch: what this is about is the
// interplay between the token in the fragment, the refresh cookie and what the
// provider does with both, and a mocked getToken hides exactly that.
const fetchMock = vi.fn()

const user = { id: "u1", email: "a@example.com", name: "管理员", auth_type: "oidc", status: "active" }

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

beforeEach(() => {
  setToken(null)
  fetchMock.mockReset().mockImplementation((path: string) => {
    if (path === "/api/auth/refresh") {
      return Promise.resolve(json(200, { token: "refreshed-token", user }))
    }
    if (path === "/api/me") return Promise.resolve(json(200, user))
    if (path.startsWith("/api/overview")) {
      return Promise.resolve(json(200, { status_counts: [], category_distribution: [], total: 0, recent_transfers: [] }))
    }
    if (path.startsWith("/api/capabilities")) return Promise.resolve(json(200, { printing: false }))
    return Promise.resolve(json(200, []))
  })
  vi.stubGlobal("fetch", fetchMock)
  window.location.hash = "#token=token-from-google"
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ""
  setToken(null)
})

/** The two routes the callback bounces between. */
function renderApp(at = "/login") {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={makeTestQueryClient()}>
        <AuthProvider>
          <LanguageProvider>
            <MemoryRouter initialEntries={[at]}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<AppShell />}>
                  <Route index element={<p>概览内容</p>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </LanguageProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

// Google sends the browser back to /login#token=… . What has to happen next is
// that the page becomes the application -- not a blank frame that comes right
// only when somebody reloads it.
describe("landing back from Google", () => {
  it("signs in and shows the application", async () => {
    renderApp()

    await waitFor(() => expect(screen.getByText("概览内容")).toBeInTheDocument(), { timeout: 3000 })
    // And the chrome came with it, rather than a loading placeholder.
    expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument()
  })

  // The cold start it was written for: a tab opened after the access token
  // expired still holds the cookie, and must come back without anyone signing
  // in again.
  it("comes back from the cookie alone when there is no fragment", async () => {
    window.location.hash = ""
    // Opening the app itself, not the callback: no token in storage, no
    // fragment, only the cookie the browser still holds.
    renderApp("/")

    await waitFor(() => expect(screen.getByText("概览内容")).toBeInTheDocument(), { timeout: 3000 })
    expect(fetchMock.mock.calls.some((c) => c[0] === "/api/auth/refresh")).toBe(true)
  })

  // And when neither is there, the login page -- not a skeleton that waits
  // forever for a session nobody has.
  it("shows the login page when there is neither a fragment nor a cookie", async () => {
    window.location.hash = ""
    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/api/auth/refresh" ? json(401, { error: {} }) : json(200, [])),
    )
    render(
      <ThemeProvider>
        <QueryClientProvider client={makeTestQueryClient()}>
          <AuthProvider>
            <LanguageProvider>
              <MemoryRouter initialEntries={["/"]}>
                <Routes>
                  <Route path="/login" element={<p>登录页</p>} />
                  <Route path="/" element={<AppShell />}>
                    <Route index element={<p>概览内容</p>} />
                  </Route>
                </Routes>
              </MemoryRouter>
            </LanguageProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    )

    await waitFor(() => expect(screen.getByText("登录页")).toBeInTheDocument(), { timeout: 3000 })
  })
})
