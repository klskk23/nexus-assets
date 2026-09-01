import type { ReactElement, ReactNode } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { AuthProvider } from "@/features/auth/useAuth"
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
}

export function renderWithProviders(ui: ReactElement, { route = "/", ...options }: Options = {}) {
  const client = makeTestQueryClient()

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
