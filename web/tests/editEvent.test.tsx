import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Timeline } from "@/features/transfers/Timeline"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { Transfer } from "@/lib/transferTypes"

function event(id: string, over: Partial<Transfer> = {}): Transfer {
  return {
    id,
    asset_id: "a1",
    batch_id: null,
    kind: "checkout",
    from_status: "in_stock",
    from_holder: { type: "entity", id: "loc", name: "上海仓库" },
    from_owner_id: "u1",
    to_status: "in_use",
    to_holder: { type: "user", id: "u2", name: "张三" },
    to_owner_id: "u1",
    due_at: null,
    created_at: "2026-08-28T09:00:00Z",
    edited_at: null,
    edited_by: null,
    ...over,
  }
}

describe("editing a transfer", () => {
  // The correction window closes as soon as the asset moves again, so an older
  // event must not even offer the affordance.
  it("offers the edit button only on the newest event", () => {
    const events = [event("old", { kind: "create" }), event("newest")]
    renderWithProviders(<Timeline events={events} editableId="newest" onEdit={vi.fn()} />)

    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).queryByRole("button", { name: "修改这条记录" })).not.toBeInTheDocument()
    expect(within(rows[1]).getByRole("button", { name: "修改这条记录" })).toBeInTheDocument()
  })

  it("offers nothing at all when no event is editable", () => {
    renderWithProviders(<Timeline events={[event("e1")]} onEdit={vi.fn()} />)
    expect(screen.queryByRole("button", { name: "修改这条记录" })).not.toBeInTheDocument()
  })

  it("passes the chosen event to the handler", async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<Timeline events={[event("newest")]} editableId="newest" onEdit={onEdit} />)

    await user.click(screen.getByRole("button", { name: "修改这条记录" }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "newest" }))
  })
})
