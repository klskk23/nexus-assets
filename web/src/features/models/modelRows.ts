import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"

/** One line of the models rail. */
export interface ModelRow {
  kind: "vendor" | "model" | "novendor"
  /** Empty on the heading, which is not a thing you can open. */
  id: string
  label: string
  count?: number
  depth: number
}

interface Input {
  vendors: VendorRow[]
  models: ProductModelRow[]
  /** Devices carrying each model. */
  counts: Record<string, number>
  isFolded: (id: string, childCount: number) => boolean
}

/**
 * Vendors with their models beneath them.
 *
 * A model has one vendor or none -- `vendor_id` is nullable because a
 * white-box or self-built device genuinely has no vendor. So unlike the fields
 * rail, nothing repeats here: this is a real one-to-many, which is most of why
 * this page is easier than that one despite looking the same.
 *
 * Models with no vendor sit under a heading that cannot be selected. "No
 * vendor" is not a vendor: nothing to rename, nothing to bind fields to, and
 * opening it would show a pane with nothing in it.
 */
export function modelTreeRows({ vendors, models, counts, isFolded }: Input): ModelRow[] {
  const out: ModelRow[] = []
  for (const v of vendors) {
    const mine = models.filter((m) => m.vendor_id === v.id)
    out.push({ kind: "vendor", id: v.id, label: v.name, count: mine.length, depth: 0 })
    if (isFolded(v.id, mine.length)) continue
    for (const m of mine) {
      out.push({ kind: "model", id: m.id, label: m.name, count: counts[m.id] ?? 0, depth: 1 })
    }
  }

  const loose = models.filter((m) => !m.vendor_id)
  if (loose.length > 0) {
    out.push({ kind: "novendor", id: "", label: "", depth: 0 })
    for (const m of loose) {
      out.push({ kind: "model", id: m.id, label: m.name, count: counts[m.id] ?? 0, depth: 1 })
    }
  }
  return out
}

/** Flat matches. Nothing repeats in this tree, so nothing needs de-duplicating. */
export function searchModelRows(
  { vendors, models, counts }: Omit<Input, "isFolded">,
  q: string,
): ModelRow[] {
  const needle = q.trim().toLowerCase()
  const hit = (s: string) => s.toLowerCase().includes(needle)
  const out: ModelRow[] = vendors
    .filter((v) => hit(v.name))
    .map((v) => ({
      kind: "vendor" as const,
      id: v.id,
      label: v.name,
      count: models.filter((m) => m.vendor_id === v.id).length,
      depth: 0,
    }))
  for (const m of models) {
    if (hit(m.name)) {
      out.push({ kind: "model", id: m.id, label: m.name, count: counts[m.id] ?? 0, depth: 0 })
    }
  }
  return out
}
