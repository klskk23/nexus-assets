import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { AppShell } from "@/routes/AppShell"
import { renderWithProviders } from "@/test/renderWithProviders"

function rail() {
  return screen.getByRole("navigation", { name: "主导航" })
}

function linkNames(scope: HTMLElement) {
  return within(scope)
    .getAllByRole("link")
    .map((a) => a.textContent?.trim() ?? "")
}

/**
 * Eleven destinations in three runs, divided by a word rather than a line.
 *
 * The order is asserted flat, across the groups, because that is the failure
 * this guards: the entries live inside three arrays now, and an entry dropped
 * while moving one -- or a twelfth added outside all three -- is invisible in
 * any test that only looks up the links it already knows about. Comparing the
 * whole run says both "these and no others" and "in this order" in one line.
 */
describe("侧栏分组", () => {
  it("三段的次序与成员固定", async () => {
    renderWithProviders(<AppShell />)
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())

    expect(linkNames(rail())).toEqual([
      "概览",
      "资产",
      "类别",
      "字段",
      "型号",
      "状态",
      "持有方",
      "账号",
      "角色",
      "审计",
    ])

    expect(linkNames(screen.getByRole("group", { name: "配置" }))).toEqual([
      "类别",
      "字段",
      "型号",
      "状态",
      "持有方",
    ])
    expect(linkNames(screen.getByRole("group", { name: "权限与审计" }))).toEqual([
      "账号",
      "角色",
      "审计",
    ])
  })

  // The first run is deliberately unlabelled, so there are two named groups and
  // not three. Asserted as a count because the mistake it catches is a heading
  // added back over the overview later "for symmetry" -- which is a decision,
  // not a tidy-up, and should have to come through here.
  it("首段不带标题", async () => {
    renderWithProviders(<AppShell />)
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())

    expect(within(rail()).getAllByRole("group")).toHaveLength(2)
    // Nothing sits between the top of the rail and the first entry.
    expect(rail().textContent?.trimStart().startsWith("概览")).toBe(true)
  })

  /**
   * A heading is a divider with a name, not a place you can land on.
   *
   * Ten entries, ten stops: a keyboard user tabbing down the rail must pass
   * through the same number of things a mouse user can click. Headings built
   * as buttons -- or given a tabindex to make them "reachable" -- would put
   * two dead stops in the path of every keyboard user, for no destination.
   */
  it("小字标题不占键盘焦点", async () => {
    renderWithProviders(<AppShell />)
    await waitFor(() => expect(screen.getByRole("link", { name: "概览" })).toBeInTheDocument())

    const stops = rail().querySelectorAll("a, button, input, select, textarea, [tabindex]")
    expect(stops).toHaveLength(within(rail()).getAllByRole("link").length)
  })

  // The audit entry is the one that may be absent, and the heading above it
  // stays. A group named for something it does not contain is the cost of
  // hiding that entry; a group that vanishes with it would take accounts and
  // roles with it, which is worse.
  it("没有审计权限时，第三段仍在，只是少一条", async () => {
    renderWithProviders(<AppShell />, { permissions: ["export"] })
    await waitFor(() => expect(screen.getByRole("link", { name: "资产" })).toBeInTheDocument())

    expect(linkNames(screen.getByRole("group", { name: "权限与审计" }))).toEqual(["账号", "角色"])
  })
})
