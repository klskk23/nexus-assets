import type { ReactElement, ReactNode } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

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
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    )
  }

  return { client, ...render(ui, { wrapper: Wrapper, ...options }) }
}
