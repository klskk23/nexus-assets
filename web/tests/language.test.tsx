import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { AppShell } from "@/routes/AppShell"
import { LanguageProvider } from "@/i18n/useLanguage"
import { applyLang, detectLang, getLang } from "@/i18n"
import { makeTestQueryClient } from "@/test/renderWithProviders"

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
      <QueryClientProvider client={client}>
        <LanguageProvider>
          <MemoryRouter initialEntries={["/"]}>
            <AppShell />
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    ),
  }
}

/**
 * Picks a language in the settings dialog.
 *
 * The account block at the foot of the rail opens the dialog directly.
 * Language lives in there with everything else a person chooses about their
 * own account.
 */
async function pickLanguage(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: /管理员|Settings|设置/ }))
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

describe("the account block", () => {
  // Two controls at the foot of the rail and no menu between you and either.
  // Signing out used to sit inside a dropdown whose only other entry was
  // settings, which is a door in front of a door.
  //
  // The count is asserted, as it was when this was a menu: the theme flip
  // used to live here, 017 left a single ground, and a stray control for a
  // choice that no longer exists is exactly what this guards against.
  it("opens settings from the name and signs out from its own button", async () => {
    const u = userEvent.setup()
    renderShell()
    await screen.findByRole("link", { name: "概览" })

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()

    const signOut = screen.getByRole("button", { name: "退出登录" })
    const account = screen.getByRole("button", { name: /管理员/ })
    expect(signOut).toBeInTheDocument()
    expect(screen.getAllByRole("button")).toHaveLength(2)

    await u.click(account)
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })
})
