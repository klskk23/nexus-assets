import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { AppShell } from "@/routes/AppShell"
import { LanguageProvider } from "@/i18n/useLanguage"
import { applyLang, detectLang, getLang } from "@/i18n"
import { makeTestQueryClient } from "@/test/renderWithProviders"
import { ThemeProvider } from "@/features/theme/useTheme"

const user = { id: "u1", email: "a@example.com", name: "管理员", auth_type: "local", status: "active" }

vi.mock("@/features/auth/useAuth", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/useAuth")>(
    "@/features/auth/useAuth",
  )
  return { ...actual, useAuth: () => ({ user, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }) }
})

function renderShell(client = makeTestQueryClient()) {
  return {
    client,
    ...render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <LanguageProvider>
            <MemoryRouter initialEntries={["/"]}>
              <AppShell />
            </MemoryRouter>
          </LanguageProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    ),
  }
}

beforeEach(() => {
  localStorage.clear()
  applyLang("zh")
})
afterEach(() => applyLang("zh"))

describe("language", () => {
  it("switches every string in the chrome, and back", async () => {
    const u = userEvent.setup()
    renderShell()

    expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument()

    // The button offers the language you would switch to, not the one in force.
    await u.click(screen.getByRole("button", { name: "切换语言" }))
    await waitFor(() => expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument())
    expect(screen.queryByRole("link", { name: "概览" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument()

    await u.click(screen.getByRole("button", { name: "Switch language" }))
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())
  })

  it("remembers the choice and tells the document", async () => {
    const u = userEvent.setup()
    renderShell()

    await u.click(screen.getByRole("button", { name: "切换语言" }))
    await waitFor(() => expect(getLang()).toBe("en"))
    expect(localStorage.getItem("nexus.lang")).toBe("en")
    // Screen readers and browser spellcheck read this.
    expect(document.documentElement.lang).toBe("en")
  })

  // Cached responses were rendered by the server in the old language -- CSV
  // headers, refusal messages, import previews. A stale Chinese error sitting
  // under an English page is exactly what this prevents.
  it("clears the query cache on a switch", async () => {
    const u = userEvent.setup()
    const { client } = renderShell()
    client.setQueryData(["something"], { rendered: "in Chinese" })

    await u.click(screen.getByRole("button", { name: "切换语言" }))
    await waitFor(() => expect(client.getQueryData(["something"])).toBeUndefined())
  })
})

describe("detectLang", () => {
  it("prefers a remembered choice over the system", () => {
    localStorage.setItem("nexus.lang", "en")
    expect(detectLang()).toBe("en")
  })

  it("follows the system when nothing has been chosen", () => {
    localStorage.clear()
    const spy = vi.spyOn(navigator, "language", "get")

    spy.mockReturnValue("en-GB")
    expect(detectLang()).toBe("en")

    spy.mockReturnValue("zh-CN")
    expect(detectLang()).toBe("zh")

    // Anything that is not clearly English gets Chinese: this is a
    // Chinese-speaking company's system.
    spy.mockReturnValue("fr-FR")
    expect(detectLang()).toBe("zh")
    spy.mockRestore()
  })
})
