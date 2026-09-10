import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Overview } from "@/routes/Overview"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { chooseByLabel } from "@/test/choose"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate }
})

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return { ...actual, api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() } }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]

const overview = {
  status_counts: [
    { status: "in_stock", count: 42 },
    { status: "in_use", count: 17 },
    { status: "in_repair", count: 3 },
    { status: "lost", count: 0 },
    { status: "retired", count: 8 },
  ],
  category_distribution: [{ category_id: "net", name: "网络设备", count: 62 }],
  // Same 62 devices, sliced by person instead of by kind. The two cards sit
  // side by side, so the fixture is built the way the server builds it: one
  // filtered fleet, two ways of adding it up.
  owner_distribution: [
    { owner_id: "u2", name: "张三", count: 40 },
    { owner_id: "u1", name: "管理员", count: 22 },
  ],
  total: 70,
  recent_transfers: [
    {
      id: "t1",
      asset_id: "a1",
      batch_id: "b1",
      kind: "checkout",
      from_status: "in_stock",
      from_holder: { type: "entity", id: "loc", name: "上海仓库" },
      from_owner_id: "u1",
      to_status: "in_use",
      to_holder: { type: "entity", id: "cust", name: "XX 集团" },
      to_owner_id: "u1",
      due_at: null,
      created_at: "2026-08-28T09:00:00Z",
      edited_at: null,
      edited_by: null,
      asset_display_name: "NX-0001",
    },
    {
      // Same batch as the one above: twenty devices moved at once produce
      // twenty movements, and this fixture holds two of them so the row count
      // means something. The old fixture held one, so the test that claimed to
      // check folding could not have seen it either way.
      id: "t2",
      asset_id: "a2",
      batch_id: "b1",
      kind: "checkout",
      from_status: "in_stock",
      from_holder: { type: "entity", id: "loc", name: "上海仓库" },
      from_owner_id: "u1",
      to_status: "in_use",
      to_holder: { type: "entity", id: "cust", name: "XX 集团" },
      to_owner_id: "u1",
      due_at: null,
      created_at: "2026-08-28T09:00:00Z",
      edited_at: null,
      edited_by: null,
      asset_display_name: "NX-0002",
    },
  ],
}

function route(p: string, cats = categories) {
  const st = statusRoute(p)
  if (st) return st

  if (p === "/categories") return Promise.resolve(cats)
  return Promise.resolve(overview)
}

beforeEach(() => {
  navigate.mockReset()
  get.mockReset().mockImplementation((p: string) => route(p))
})

describe("Overview", () => {
  it("shows a card for every status, including the ones at zero", async () => {
    renderWithProviders(<Overview />)
    expect(await screen.findByRole("button", { name: "在库 42 台" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "已签出 17 台" })).toBeInTheDocument()
    // A card that vanishes at zero makes the row jump around as stock moves.
    expect(screen.getByRole("button", { name: "丢失 0 台" })).toBeInTheDocument()
    expect(screen.getByText("共 70 台")).toBeInTheDocument()
  })

  // A zero is dimmer, not dead. "Show me the lost ones" is a real question
  // even when the answer is none, and an empty filtered list says that far
  // more clearly than a block that will not respond. This is asserted because
  // a layout round is exactly when a block quietly stops being a button --
  // 018 rebuilt this one from a Card with role="button" into a real one.
  it("still takes you to the list when the count is zero", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)

    await user.click(await screen.findByRole("button", { name: "丢失 0 台" }))
    expect(navigate).toHaveBeenCalledWith("/assets?status=lost")
  })

  it("takes you to the correspondingly filtered asset list", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)

    await user.click(await screen.findByRole("button", { name: "已签出 17 台" }))
    expect(navigate).toHaveBeenCalledWith("/assets?status=in_use")
  })

  it("makes the status cards reachable from the keyboard", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)
    const card = await screen.findByRole("button", { name: "维修中 3 台" })

    card.focus()
    await user.keyboard("{Enter}")
    expect(navigate).toHaveBeenCalledWith("/assets?status=in_repair")
  })

  /*
   * "says the distribution leaves retired devices out" is gone with the
   * sentence it asserted.
   *
   * It was guarding a line of prose under the card's title, and the prose went
   * with every other line on the product that only explained the system to
   * somebody who reads it once. **The behaviour it described still holds and
   * is still guarded**, in the two places that can actually catch it changing:
   * TestOwnerDistributionDropsWhatTheCategoryDistributionDrops on the server,
   * and 「与类别分布加起来是同一个数」 below -- both of which compare numbers
   * rather than read a caption.
   */

  // Whatever draws it has to carry the same two things the list it replaced
  // did: which category, and how many.
  it("draws each category as a track labelled with its name and count", async () => {
    renderWithProviders(<Overview />)
    await screen.findByText("类别分布")

    const bar = await screen.findByRole("button", { name: "网络设备 62 台" })
    expect(within(bar).getByText("网络设备")).toBeInTheDocument()
    expect(within(bar).getByText("62")).toBeInTheDocument()
  })

  // A percentage width on an inline box is ignored, which would draw every
  // category the same length and be wrong without ever looking broken.
  it("fills each track in proportion to the largest category", async () => {
    const { container } = renderWithProviders(<Overview />)
    await screen.findByText("类别分布")

    const fill = await waitFor(() => {
      const el = container.querySelector("[style*='width']")
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    // The class, not the computed style: this suite runs with css disabled, so
    // jsdom computes nothing for a Tailwind utility and the check would pass on
    // an element that has no display at all.
    expect(fill.className).toContain("block")
    expect(fill.style.width).toBe("100%")
  })

  // The list it replaced was clickable; losing that would be a step back. It is
  // a button now rather than a click handler on an SVG rectangle, so the
  // keyboard reaches it as well.
  it("navigates from a track into the filtered asset list", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)
    await screen.findByText("类别分布")

    await user.click(await screen.findByRole("button", { name: "网络设备 62 台" }))

    expect(navigate).toHaveBeenCalledWith("/assets?category_id=net&include_descendants=true")
  })

  // 023 stopped folding, and the reason is the column that replaced it.
  //
  // The old card showed "moved 20 devices" as one entry, which reads well until
  // you ask which twenty -- and that question is the whole reason this card
  // exists. A row per device answers it, at the cost of a large batch filling
  // the card. Accepted: the card shows a chosen number of most recent
  // movements, and a batch of twenty genuinely IS the twenty most recent.
  it("gives a batch one row per device, each naming its own", async () => {
    renderWithProviders(<Overview />)
    const table = await screen.findByRole("table")
    // Header plus one row per movement, rather than one folded entry.
    expect(within(table).getAllByRole("row")).toHaveLength(3)
    // And each names its own device, which is the point of not folding.
    expect(within(table).getByText("NX-0001")).toBeInTheDocument()
    expect(within(table).getByText("NX-0002")).toBeInTheDocument()
  })

  // Entering a device is the page's action, not a section of it. It used to
  // be a whole column holding a category select and a button; the entry
  // dialog asks for the category itself, so the column was a step in front of
  // a step.
  it("starts a new asset from the page's own action", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)
    await screen.findByText(/共 70 台/)

    await user.click(screen.getByRole("button", { name: "录入设备" }))
    expect(navigate).toHaveBeenCalledWith("/assets?new=1")
  })

  // A fresh install has nothing configured, and a category is what says which
  // fields a device even has. Disabled and saying what is missing, per the
  // product's own rule -- not hidden, which would leave someone looking for a
  // button that is not there.
  it("disables entry until a category exists, and says why", async () => {
    get.mockImplementation((p: string) => route(p, []))
    renderWithProviders(<Overview />)
    await screen.findByText(/共 70 台/)

    const enter = screen.getByRole("button", { name: "录入设备" })
    expect(enter).toBeDisabled()
    expect(enter).toHaveAttribute("title", expect.stringContaining("类别"))
  })

  it("shows an error state with a retry", async () => {
    get.mockImplementation((p: string) =>
      p.startsWith("/overview") ? Promise.reject(new Error("服务不可用")) : Promise.resolve(categories),
    )
    renderWithProviders(<Overview />)
    expect(await screen.findByRole("alert")).toHaveTextContent("服务不可用")
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })
})

// Each entry is a multi-line block, so ten of them is already a long card on a
// page meant to be taken in at a glance. The count exists, and now it shows.
describe("Overview recent count", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation((p: string) => route(p))
  })

  it("asks for ten by default", async () => {
    renderWithProviders(<Overview />)
    await screen.findByText("最近流转")

    const asked = get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/overview"))
    expect(asked[0]).toBe("/overview?recent=10")
  })

  it("lets the count be changed", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)
    await screen.findByText("最近流转")

    await chooseByLabel(user, "显示条数", "5 条")
    await waitFor(() => {
      const asked = get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/overview"))
      expect(asked[asked.length - 1]).toBe("/overview?recent=5")
    })
  })
})

// The count of statuses is configurable, and splitting them across two
// containers would read as two unrelated groups rather than one list. What is
// pinned here is that claim and only that claim: every status lives in one
// list, whatever that list is made of.
//
// Not the classes that lay it out. jsdom measures nothing, so an assertion on
// `grid-cols-[...]` would pass a broken row and fail a working one the moment
// the mechanism changed -- which is what happened twice, when this went from
// grid to flex and then from cards to bars. How it looks is a question for
// the screenshot walkthrough, and it is answered there.
it("keeps every status in one list", async () => {
  renderWithProviders(<Overview />)
  const row = await screen.findByRole("button", { name: /在库 42/ })

  const list = row.closest("ul")!
  expect(within(list).getAllByRole("button")).toHaveLength(5)
})

/*
 * The third card: who is answering for what.
 *
 * It is the same fleet as the card beside it, sliced by person instead of by
 * kind. Everything here follows from that -- the same filter, so the two
 * columns add up to each other; a bar per person, so the way in is the asset
 * list filtered to them; and a cap, because people are not bounded the way
 * five statuses and a handful of root categories are.
 */
describe("负责人名下", () => {
  it("每人一条，按台数从多到少", async () => {
    renderWithProviders(<Overview />)

    const first = await screen.findByRole("button", { name: /张三 40 台/ })
    const list = first.closest("ul")!
    const names = within(list)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
    expect(names).toEqual(["张三 40 台", "管理员 22 台"])
  })

  // Two slices of one fleet. A reader takes them for the same devices counted
  // two ways, and on this page they are -- so if these ever stop adding up,
  // the page is telling two stories with no way to tell which is true.
  it("与类别分布加起来是同一个数", async () => {
    renderWithProviders(<Overview />)
    await screen.findByRole("button", { name: /张三 40 台/ })

    const sum = (label: RegExp) => {
      const list = screen.getByRole("button", { name: label }).closest("ul")!
      return within(list)
        .getAllByRole("button")
        .reduce((n, b) => n + Number(b.getAttribute("aria-label")!.match(/(\d+) 台/)![1]), 0)
    }
    expect(sum(/张三 40 台/)).toBe(sum(/网络设备 62 台/))
  })

  it("点一个人就去他名下的设备列表", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)

    await user.click(await screen.findByRole("button", { name: /张三 40 台/ }))
    expect(navigate).toHaveBeenCalledWith("/assets?owner_id=u2")
  })

  /*
   * Eight bars, and the rest counted in a line under the title.
   *
   * A card that grows a row per account would tower over its two neighbours in
   * an organisation of fifty, and the question it answers -- who is carrying
   * the most -- is answered by the top of the list. What it must not do is
   * hide the remainder silently: the reader has to know they are looking at
   * part of it, which is the same rule the folded rails follow.
   */
  it("超过八人时只画八条，其余在标题下说明", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      owner_id: `u${i}`,
      name: `同事 ${String(i).padStart(2, "0")}`,
      count: 20 - i,
    }))
    get.mockImplementation((p: string) =>
      p.startsWith("/overview")
        ? Promise.resolve({ ...overview, owner_distribution: many })
        : route(p),
    )
    renderWithProviders(<Overview />)

    const first = await screen.findByRole("button", { name: /同事 00 20 台/ })
    expect(within(first.closest("ul")!).getAllByRole("button")).toHaveLength(8)
    // 11 - 8 = 3 people, holding 12 + 11 + 10 devices between them.
    expect(screen.getByText(/另有 3 人共 33 台/)).toBeInTheDocument()
  })
})
