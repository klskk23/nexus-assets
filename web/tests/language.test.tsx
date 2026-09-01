import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
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

/**
 * Picks a language in the settings dialog.
 *
 * The menu behind the account name carries the settings entry, the one-click
 * theme flip and signing out; language moved into the dialog with everything
 * else a person chooses about their own account.
 */
async function pickLanguage(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: /管理员|Settings|设置/ }))
  await user.click(await screen.findByRole("menuitem", { name: /设置|Settings/ }))
  const dialog = await screen.findByRole("dialog")
  await user.click(within(dialog).getByRole("combobox", { name: /语言|Language/ }))
  await user.click(await screen.findByRole("option", { name }))
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

    await pickLanguage(u, "English")
    await waitFor(() => expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument())
    expect(screen.queryByRole("link", { name: "概览" })).not.toBeInTheDocument()

    await pickLanguage(u, "中文")
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())
  })

  it("remembers the choice and tells the document", async () => {
    const u = userEvent.setup()
    renderShell()

    await pickLanguage(u, "English")
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

    await pickLanguage(u, "English")
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

describe("settings menu", () => {
  it("gathers settings, the theme flip and sign-out behind one trigger", async () => {
    const u = userEvent.setup()
    renderShell()
    await screen.findByRole("link", { name: "概览" })

    // The bar itself carries only the nav and one control.
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()

    await u.click(screen.getByRole("button", { name: /管理员/ }))
    expect(await screen.findByRole("menuitem", { name: "设置" })).toBeInTheDocument()
    // The theme flip stays in the menu: it is a daily one-click action, while
    // everything in the dialog is chosen twice a year.
    expect(screen.getByRole("menuitem", { name: /切换到浅色|切换到深色/ })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument()
  })
})
