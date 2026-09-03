import type { ReactElement, ReactNode } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { AuthProvider } from "@/features/auth/useAuth"
import { PERMISSIONS as ALL_PERMISSIONS } from "@/features/auth/usePermissions"
import { LanguageProvider } from "@/i18n/useLanguage"
import { ThemeProvider } from "@/features/theme/useTheme"

/**
 * Builds a QueryClient suited to tests.
 *
 * retry:false matters: with the default retry policy a test asserting the error
 * state waits out every attempt and shows up as a random timeout rather than a
 * failure. gcTime:0 plus a fresh client per test keeps cases from leaking cache
 * into one another, which the constitution forbids (tests must not depend on
 * execution order).
 */
export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface Options extends Omit<RenderOptions, "wrapper"> {
  route?: string
  /**
   * Leaves nobody signed in. The default is an administrator, because almost
   * every test is about what a page does rather than about who may open it --
   * and with permissions in play, "signed out" now means every button is
   * disabled, which would make those tests fail for a reason they are not
   * about.
   */
  signedOut?: boolean
  /** What the signed-in account may do. Defaults to everything. */
  permissions?: string[]
}

export function renderWithProviders(
  ui: ReactElement,
  { route = "/", signedOut = false, permissions, ...options }: Options = {},
) {
  const client = makeTestQueryClient()

  // Signed in by seeding the cache rather than by stubbing an endpoint: every
  // test file mocks the api client its own way, and the session is not what
  // any of them are testing.
  if (!signedOut) {
    try {
      localStorage.setItem("nexus.token", "test-token")
    } catch {
      /* jsdom without storage; the seeded query below still stands */
    }
    // Pinned, or the client's staleTime of 0 refetches immediately and the
    // seeded account is replaced by whatever this file's api mock returns for
    // /me -- which is usually nothing.
    client.setQueryDefaults(["me"], { staleTime: Infinity, gcTime: Infinity })
    client.setQueryData(["me", "test-token"], {
      id: "u1",
      email: "admin@example.com",
      name: "Test Admin",
      auth_type: "local",
      status: "active",
      permissions: permissions ?? ALL_PERMISSIONS,
      is_admin: permissions === undefined,
    })
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <QueryClientProvider client={client}>
          {/* With no token stored -- which is every test unless one puts one
              there -- this fetches nothing and reports a signed-out user. */}
          <AuthProvider>
            {/* Present because the settings dialog reads it; switching
                language remounts the subtree, which is the provider's own
                doing and nothing a test has to arrange. */}
            <LanguageProvider>
              <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
            </LanguageProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    )
  }

  return { client, ...render(ui, { wrapper: Wrapper, ...options }) }
}
