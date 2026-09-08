import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { AppShell } from "@/routes/AppShell"
import { AuthProvider, useAuth } from "@/features/auth/useAuth"
import { LanguageProvider } from "@/i18n/useLanguage"
import { makeTestQueryClient } from "@/test/renderWithProviders"
import type { User } from "@/lib/types"

// What the server actually returns from POST /auth/login: a name and a role
// id, and neither of the two fields every permission check reads.
const fromLogin = {
  id: "u1",
  email: "a@example.com",
  name: "管理员",
  auth_type: "local",
  status: "active",
  role_id: "role-admin",
} as unknown as User

// What /me returns for the same person.
const fromMe = { ...fromLogin, is_admin: true, permissions: ["audit.read"] }

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
    getToken: () => null,
    setToken: vi.fn(),
    restoreSession: async () => null,
  }
})

/** Signs in the way the login page does, then renders the shell. */
function SignInThenShell() {
  const { user, signIn } = useAuth()
  if (!user) {
    signIn("tok", fromLogin)
    return null
  }
  return <AppShell />
}

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) => {
    if (p === "/me") return Promise.resolve(fromMe)
    if (p.startsWith("/roles")) return Promise.resolve({ items: [], total: 0 })
    return Promise.resolve([])
  })
})

// The sign-in response is a placeholder and /me is the answer. Seeding the
// cache with the placeholder and leaving it there meant /me was never called:
// the client held it fresh for its staleTime and nothing remounted to refetch.
// Every permission then read undefined, and the one nav entry gated on a
// permission vanished for an admin who had just signed in -- until a reload.
describe("signing in", () => {
  it("fetches /me, so permissions are the real ones and not the login response's", async () => {
    const client = makeTestQueryClient()
    // The whole bug lives in staleTime. The shared test client uses 0, which
    // refetches everything always and so cannot reproduce a stale-seed
    // problem -- written without this line, this test passed with the fix
    // reverted. The app's own client holds queries fresh for 30s.
    client.setQueryDefaults(["me"], { staleTime: 30_000 })
    render(
      <QueryClientProvider client={client}>
        <LanguageProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={["/"]}>
              <SignInThenShell />
            </MemoryRouter>
          </AuthProvider>
        </LanguageProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(get).toHaveBeenCalledWith("/me"))
    // The audit entry is the visible symptom: it is the one destination gated
    // on a permission, so it is the one that disappears when permissions are
    // silently empty.
    expect(await screen.findByRole("link", { name: "审计" })).toBeInTheDocument()
  })
})
