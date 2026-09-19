import { beforeEach, describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AppShell } from "@/routes/AppShell"
import { renderWithProviders } from "@/test/renderWithProviders"

/**
 * The rail folds to its icons, and remembers.
 *
 * The brand block is the switch (030, decision 221): it was never a link --
 * "Overview" already goes where a logo would -- so it had a click to give.
 * Folded, every entry keeps its name in a title, because an icon on its own
 * is a guess and a rail of ten guesses is a rail nobody uses.
 *
 * **jsdom does not lay out**, so the 216px / 60px widths are the walkthrough's
 * to measure. What is testable is the decision and its two consequences: the
 * labels leave the accessible tree, the titles arrive, and the choice is in
 * localStorage for the next visit.
 */
function rail() {
  return screen.getByRole("navigation", { name: "主导航" })
}

describe("侧栏折叠", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("点品牌块折叠：文字退场、title 登场；再点展开", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AppShell />)
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())

    const brand = screen.getByRole("button", { name: "折叠导航" })
    await user.click(brand)

    // The link is still there and still named -- by its title now -- but the
    // visible word is gone. `md:hidden` is a class jsdom cannot evaluate, so
    // the visible half of that is the walkthrough's; the title is the half
    // that lives in the DOM.
    const overview = within(rail()).getByRole("link", { name: "概览" })
    expect(overview).toHaveAttribute("title", "概览")
    expect(screen.getByRole("button", { name: "展开导航" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "展开导航" }))
    expect(within(rail()).getByRole("link", { name: "概览" })).not.toHaveAttribute("title")
    expect(screen.getByRole("button", { name: "折叠导航" })).toBeInTheDocument()
  })

  it("折叠状态记在这台浏览器上，下次打开仍折叠", async () => {
    const user = userEvent.setup()
    const first = renderWithProviders(<AppShell />)
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "折叠导航" }))
    expect(localStorage.getItem("nexus.nav.collapsed")).toBe("1")
    first.unmount()

    renderWithProviders(<AppShell />)
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())
    expect(screen.getByRole("button", { name: "展开导航" })).toBeInTheDocument()
    expect(within(rail()).getByRole("link", { name: "概览" })).toHaveAttribute("title", "概览")
  })

  // The narrow-screen strip is not the fold: the fold's classes are all
  // md-prefixed, so below md the strip is what it always was. A source-level
  // check, since jsdom has no viewport to shrink.
  it("窄屏塌陷不参与折叠（折叠的类都带 md: 前缀）", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const src = readFileSync(join(import.meta.dirname, "..", "src", "routes", "AppShell.tsx"), "utf8")
    const collapsedClasses = [...src.matchAll(/collapsed && "([^"]+)"/g)].flatMap((m) =>
      m[1].split(/\s+/),
    )
    expect(collapsedClasses.length).toBeGreaterThan(0)
    for (const c of collapsedClasses) expect(c, c).toMatch(/^md:/)
  })
})
