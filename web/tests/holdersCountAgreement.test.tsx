import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"

import { Holders } from "@/routes/Holders"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { HolderEntity } from "@/lib/types"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  }
})

const AT = { path: ["/holders", "/holders/:id"] as string[] }

const holders: HolderEntity[] = [
  { id: "co", type: "company", name: "国药集团", parent_id: null, note: "", is_default_stock: false },
  { id: "dp", type: "department", name: "研发部", parent_id: "co", note: "", is_default_stock: false },
  { id: "lab", type: "location", name: "三楼实验室", parent_id: "dp", note: "", is_default_stock: false },
  { id: "empty", type: "location", name: "外包机房", parent_id: "co", note: "", is_default_stock: false },
]

/**
 * The server's answer, given once.
 *
 * Both the rail and the pane read it, which is the point: they cannot disagree
 * without the fixture itself being inconsistent. Written the way
 * categoryCounts.test.tsx puts it -- two assertions of "42" would both stay
 * green on the day the two paths part company, because whoever changed the
 * fixture would change both constants.
 */
const COUNTS: Record<string, number> = { co: 42, dp: 18, lab: 6, empty: 0 }

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) => {
    if (p === "/holders/counts") return Promise.resolve(COUNTS)
    if (/^\/holders\/.+\/usage$/.test(p)) {
      return Promise.resolve({ assets: 0, children: 0, history: 0 })
    }
    if (p.startsWith("/holders")) return Promise.resolve(holders)
    return Promise.resolve([])
  })
})

/*
 * One holder, three places, one number.
 *
 * The rail's row, the words on the pane's link, and the filter that link
 * carries. A holder saying 42 and its list showing 12 is the defect 024 spent
 * a whole round closing for categories, and it is the one thing here that
 * makes a reader distrust the ledger rather than the page.
 */
describe("同一个持有方只有一个数", () => {
  it.each([
    ["co", "国药集团"],
    ["dp", "研发部"],
    ["lab", "三楼实验室"],
  ])("行尾的数与链接文案里的数相等：%s", async (id, name) => {
    renderWithProviders(<Holders />, { route: `/holders/${id}`, ...AT })

    const row = await screen.findByRole("link", { name: new RegExp(`^${name}`) })
    const fromRail = (row.textContent ?? "").match(/\d+/)?.[0]
    expect(fromRail).toBeDefined()

    const link = screen.getByRole("link", { name: /台设备/ })
    const fromPane = (link.textContent ?? "").match(/\d+/)?.[0]

    expect(fromPane).toBe(fromRail)
  })

  // The link is the third place the number appears -- as a question asked of
  // the server. If it does not carry the subtree flag, the list on the other
  // end counts one holder while the rail counted a whole branch.
  it("链接带上「含下级」，否则点进去的行数对不上", async () => {
    renderWithProviders(<Holders />, { route: "/holders/co", ...AT })

    const link = await screen.findByRole("link", { name: /台设备/ })
    expect(link).toHaveAttribute(
      "href",
      "/assets?holder_type=entity&holder_id=co&holder_include_descendants=true",
    )
  })

  // A blank where a number belongs reads as "not loaded", which is a different
  // answer from "none" -- and the reader cannot tell them apart afterwards.
  it("零也写出来，不留白", async () => {
    renderWithProviders(<Holders />, { route: "/holders/empty", ...AT })

    const row = await screen.findByRole("link", { name: /^外包机房/ })
    expect(within(row).getByText("0")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /台设备/ })).toHaveTextContent("0")
  })

  // One request for the whole page, not one per holder.
  it("计数只问一次，与持有方数量无关", async () => {
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    await screen.findByRole("link", { name: /^国药集团/ })
    const asked = get.mock.calls.map((c) => String(c[0]))
    expect(asked.filter((p) => p === "/holders/counts")).toHaveLength(1)
  })
})
