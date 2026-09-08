import { Timeline } from "nexus-assets-web"

/**
 * Movement history, newest first. The top entry is where the device is now and
 * reads differently from the ones behind it -- a ring where the others are
 * dots, and the word "当前" beside it. The difference is shape and text, never
 * hue alone: these get printed and photographed as much as they are read.
 *
 * The events are shaped exactly as /assets/:id/transfers returns them, and the
 * kinds are the six the server actually derives (create, checkout, checkin,
 * transfer, reassign, status_change) -- an invented one falls through the
 * catalogue and the badge renders the raw key.
 */
const actor = { id: "u1", name: "管理员" }
const warehouse = { type: "entity" as const, id: "loc1", name: "上海仓库" }
const person = { type: "user" as const, id: "u2", name: "张三" }

const event = (over: Record<string, unknown>) => ({
  id: "e1",
  asset_id: "a1",
  kind: "checkout",
  actor,
  from_holder: warehouse,
  to_holder: person,
  from_status: "in_stock",
  to_status: "checked_out",
  note: "",
  batch_id: null,
  created_at: "2026-09-02T09:20:00Z",
  ...over,
})

export const History = () => (
  <Timeline
    events={[
      event({ id: "e3", kind: "status_change", to_holder: warehouse, from_holder: person, from_status: "checked_out", to_status: "repairing", note: "风扇异响，送修", created_at: "2026-09-06T14:05:00Z" }),
      event({ id: "e2", kind: "checkin", to_holder: warehouse, from_holder: person, from_status: "checked_out", to_status: "in_stock", created_at: "2026-09-04T11:30:00Z" }),
      event({ id: "e1" }),
    ]}
  />
)

/** Twenty devices shipped together are one action, not twenty rows. */
export const FoldedBatch = () => (
  <Timeline
    events={Array.from({ length: 12 }, (_, i) =>
      event({ id: `b${i}`, asset_id: `a${i}`, batch_id: "batch-1", kind: "transfer", to_holder: { type: "entity" as const, id: "loc2", name: "北京仓库" }, note: "机房搬迁" }),
    )}
  />
)

/** An empty panel says nothing; an empty state says what would fill it. */
export const Empty = () => <Timeline events={[]} />
