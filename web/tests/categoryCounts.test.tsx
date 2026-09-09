import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { Categories } from "@/routes/Categories"
import { Overview } from "@/routes/Overview"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  {
    id: "rt",
    code: "RT",
    name: "SDWAN 路由器",
    parent_id: "net",
    path: "/net/rt/",
    display_key: "",
  },
]

/**
 * The server's answer, given once.
 *
 * Both screens read it, which is the point: the endpoint returns subtree
 * totals and the overview's root figure is one of its entries, so the two
 * cannot disagree without the fixture itself being inconsistent.
 */
const COUNTS: Record<string, number> = { net: 41, rt: 12 }

function route(p: string) {
  const st = statusRoute(p)
  if (st) return st
  if (p === "/categories") return Promise.resolve(categories)
  if (p === "/categories/counts") return Promise.resolve(COUNTS)
  if (p.startsWith("/overview")) {
    return Promise.resolve({
      status_counts: [{ status: "in_stock", count: 41 }],
      category_distribution: categories
        .filter((c) => c.parent_id === null)
        .map((c) => ({ category_id: c.id, name: c.name, count: COUNTS[c.id] })),
      total: 41,
      recent_transfers: [],
    })
  }
  if (p === "/capabilities") return Promise.resolve({ printing: false })
  if (p.endsWith("/schema")) return Promise.resolve({ category: categories[1], fields: [] })
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
})

/**
 * One category, two screens, one number.
 *
 * Read off both and compared with each other -- not each against a constant.
 * Two tests asserting `41` would both stay green on the day the two paths
 * start disagreeing, because whoever changed the fixture would change both
 * constants and nothing would notice the drift. Comparing the screens to each
 * other is the only shape of this test that can fail for the right reason.
 *
 * A category showing 41 in one place and 43 in another has no explanation
 * anywhere in the interface, and whoever sees it concludes the ledger is
 * wrong. That is worse than the number being missing.
 */
describe("同一个类别只有一个数", () => {
  it("概览与类别页显示的数字相等", async () => {
    const overview = renderWithProviders(<Overview />)
    const bar = await screen.findByRole("button", { name: /网络设备/ })
    const fromOverview = (bar.textContent ?? "").match(/\d+/)?.[0]
    expect(fromOverview).toBeDefined()
    overview.unmount()

    renderWithProviders(<Categories />, { route: "/categories/net", path: "/categories/:id" })
    const row = await screen.findByRole("link", { name: /网络设备/ })
    const fromTree = (row.textContent ?? "").match(/\d+/)?.[0]

    expect(fromTree).toBe(fromOverview)
  })

  // The row for a category with nothing in it still shows a digit. A blank
  // where a number belongs reads as "not loaded", which is a different answer
  // from "none" and the reader cannot tell them apart after the fact.
  it("零也写出来，不留白", async () => {
    get.mockImplementation((p: string) =>
      p === "/categories/counts" ? Promise.resolve({ net: 0, rt: 0 }) : route(p),
    )
    renderWithProviders(<Categories />, { route: "/categories/net", path: "/categories/:id" })
    const row = await screen.findByRole("link", { name: /SDWAN 路由器/ })
    expect(within(row).getByText("0")).toBeInTheDocument()
  })

  // Same category, two entrances, one list -- the detail pane's link must be
  // scoped exactly as the overview's bar is.
  it("右栏去设备列表的链接含子类别，与概览一致", async () => {
    renderWithProviders(<Categories />, { route: "/categories/net", path: "/categories/:id" })
    const link = await screen.findByRole("link", { name: /台设备/ })
    expect(link).toHaveAttribute(
      "href",
      "/assets?category_id=net&include_descendants=true",
    )

    await waitFor(() => expect(get).toHaveBeenCalledWith("/categories/counts"))
  })
})
