import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"

import { Timeline, foldBatches } from "@/features/transfers/Timeline"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusList } from "./fixtures/statuses"
import type { Transfer, TransferKind } from "@/lib/transferTypes"

// The timeline reads status labels from the API now rather than from a table
// compiled into the bundle, so even this pure-render test needs the list.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: () => Promise.resolve(statusList), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  }
})

function event(over: Partial<Transfer> & { id: string }): Transfer {
  return {
    asset_id: "a1",
    batch_id: null,
    kind: "transfer" as TransferKind,
    from_status: "in_stock",
    from_holder: { type: "entity", id: "loc", name: "上海仓库" },
    from_owner_id: "u1",
    to_status: "in_use",
    to_holder: { type: "user", id: "u2", name: "张三" },
    to_owner_id: "u1",
    due_at: null,
    actor: { id: "u1", email: "a@example.com", name: "管理员", auth_type: "local", status: "active" },
    created_at: "2026-08-28T09:00:00Z",
    edited_at: null,
    edited_by: null,
    ...over,
  }
}

describe("foldBatches", () => {
  it("collapses a 20-asset shipment into a single entry", () => {
    const batch = Array.from({ length: 20 }, (_, i) =>
      event({ id: `e${i}`, batch_id: "b1", asset_id: `a${i}` }),
    )
    const folded = foldBatches(batch)
    expect(folded).toHaveLength(1)
    expect(folded[0].count).toBe(20)
  })

  it("never folds events that carry no batch id", () => {
    const singles = [event({ id: "e1" }), event({ id: "e2" }), event({ id: "e3" })]
    expect(foldBatches(singles)).toHaveLength(3)
  })

  it("keeps separate batches apart and preserves order", () => {
    const mixed = [
      event({ id: "e1", kind: "create", batch_id: null }),
      event({ id: "e2", batch_id: "b1" }),
      event({ id: "e3", batch_id: "b1" }),
      event({ id: "e4", batch_id: "b2" }),
      event({ id: "e5" }),
    ]
    const folded = foldBatches(mixed)
    expect(folded.map((f) => f.count)).toEqual([1, 2, 1, 1])
    expect(folded.map((f) => f.event.id)).toEqual(["e1", "e2", "e4", "e5"])
  })
})

describe("Timeline", () => {
  it("renders a 20-row batch as one entry labelled with its size", () => {
    const batch = Array.from({ length: 20 }, (_, i) =>
      event({ id: `e${i}`, batch_id: "b1", asset_id: `a${i}` }),
    )
    renderWithProviders(<Timeline events={batch} />)

    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText("批量操作（20 台）")).toBeInTheDocument()
  })

  it("shows where the device came from and where it went", async () => {
    renderWithProviders(<Timeline events={[event({ id: "e1", kind: "checkout" })]} />)
    const row = screen.getByRole("listitem", { name: "签出" })
    expect(row).toHaveTextContent("上海仓库")
    expect(row).toHaveTextContent("张三")
    // Status labels come from the API, so they land a tick after the holders.
    await waitFor(() => expect(row).toHaveTextContent("在库"))
    expect(row).toHaveTextContent("已签出")
    expect(within(row).getByText(/管理员/)).toBeInTheDocument()
  })

  it("marks an event that has been corrected", () => {
    renderWithProviders(
      <Timeline
        events={[event({ id: "e1", edited_at: "2026-08-28T10:00:00Z", edited_by_name: "管理员" })]}
      />,
    )
    expect(screen.getByText("已由 管理员 修改")).toBeInTheDocument()
  })

  /**
   * The newest entry is where the device is now, and it has to read differently
   * from the ones behind it.
   *
   * Differently in shape, not only in colour: a timeline whose tiers differ by
   * hue alone tells a colour-blind reader nothing, and these get printed and
   * photographed as much as they are read on a screen. So the current entry
   * carries a word, and its marker is a ring where the others are dots.
   */
  it("marks the newest entry as current, and not by colour alone", () => {
    const { container } = renderWithProviders(
      <Timeline events={[event({ id: "e1" }), event({ id: "e2" }), event({ id: "e3" })]} />,
    )

    const rows = screen.getAllByRole("listitem")
    expect(within(rows[0]).getByText("当前")).toBeInTheDocument()
    expect(within(rows[1]).queryByText("当前")).not.toBeInTheDocument()

    // The markers differ in build, not in fill: a ring on the current one and a
    // filled dot on the rest. Both are the same sage -- which is the point, and
    // is why this asserts the ring rather than the colour.
    const markers = [...container.querySelectorAll("li > span[aria-hidden]")]
    expect(markers).toHaveLength(rows.length)
    expect(markers[0].className).toContain("border-")
    expect(markers[1].className).not.toContain("border-")
  })

  it("offers an empty state instead of a blank panel", () => {
    renderWithProviders(<Timeline events={[]} />)
    expect(screen.getByText("还没有流转记录")).toBeInTheDocument()
  })
})
