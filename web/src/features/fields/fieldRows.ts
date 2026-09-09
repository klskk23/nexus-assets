import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/metaTypes"

/** One line of the fields rail: a group, a field under one, or a heading. */
export interface FieldRow {
  kind: "group" | "field" | "ungrouped"
  /** Empty on the heading, which is not a thing you can open. */
  id: string
  label: string
  /** Members for a group, bindings for a field. */
  count?: number
  depth: number
}

interface Input {
  groups: FieldGroupRow[]
  fields: FieldDefinitionRow[]
  /** Groups whose members are hidden right now. */
  isFolded: (id: string, childCount: number) => boolean
}

/**
 * How many targets a field is bound to.
 *
 * Summed from the three arrays `GET /fields` already returns rather than
 * fetched. An endpoint for it was written first and then removed: the server
 * had to ask all three binding tables to fill those arrays anyway, so a second
 * path to the same number would have been one more thing that can disagree
 * with the first.
 *
 * Zero matters most here -- "is anything still using this field" is what
 * somebody checks before deleting one -- which is why it is written out rather
 * than left blank.
 */
export function bindingCount(f: FieldDefinitionRow): number {
  return (
    (f.category_ids?.length ?? 0) + (f.model_ids?.length ?? 0) + (f.vendor_ids?.length ?? 0)
  )
}

/**
 * The rail, as a tree of groups with their fields beneath them.
 *
 * A field belongs to any number of groups, so **a field appears once under
 * each of its groups**. That is the shape of `field_group_members`, not a
 * decision made here: its key is (group_id, field_id) and it is read in both
 * directions.
 *
 * The duplication is allowed to be visible because selection carries the
 * information back: the address names a field, not a row, so every copy of it
 * highlights at once and the reader sees that it sits in two groups. Highlight
 * only one and the two identical lines with one lit read as two different
 * things.
 *
 * Fields in no group at all go under a heading that cannot be selected -- it
 * has no name to change and no members to manage, so a node there would open
 * an empty pane.
 */
export function fieldTreeRows({ groups, fields, isFolded }: Input): FieldRow[] {
  const byID = new Map(fields.map((f) => [f.id, f]))
  const out: FieldRow[] = []
  const grouped = new Set<string>()

  for (const g of groups) {
    const members = (g.field_ids ?? []).map((id) => byID.get(id)).filter(Boolean) as FieldDefinitionRow[]
    members.forEach((f: FieldDefinitionRow) => grouped.add(f.id))
    out.push({ kind: "group", id: g.id, label: g.name, count: members.length, depth: 0 })
    if (isFolded(g.id, members.length)) continue
    for (const f of members) {
      out.push({ kind: "field", id: f.id, label: f.label, count: bindingCount(f), depth: 1 })
    }
  }

  const loose = fields.filter((f) => !grouped.has(f.id))
  if (loose.length > 0) {
    out.push({ kind: "ungrouped", id: "", label: "", depth: 0 })
    for (const f of loose) {
      out.push({ kind: "field", id: f.id, label: f.label, count: bindingCount(f), depth: 1 })
    }
  }
  return out
}

/**
 * The matches, flat and each field exactly once.
 *
 * Flattening removes the groups, and with them the only thing the duplication
 * was carrying. Two identical lines in a list with no hierarchy say nothing
 * except "this appears twice", which is not true of the field -- there is one
 * of it.
 *
 * Groups match too: somebody searching "采购" may be after the group rather
 * than a field in it.
 */
export function searchFieldRows(
  { groups, fields }: Omit<Input, "isFolded">,
  q: string,
): FieldRow[] {
  const needle = q.trim().toLowerCase()
  const hit = (s: string) => s.toLowerCase().includes(needle)

  const out: FieldRow[] = groups
    .filter((g) => hit(g.name))
    .map((g) => ({
      kind: "group" as const,
      id: g.id,
      label: g.name,
      count: (g.field_ids ?? []).length,
      depth: 0,
    }))

  for (const f of fields) {
    if (hit(f.label) || hit(f.key)) {
      out.push({ kind: "field", id: f.id, label: f.label, count: bindingCount(f), depth: 0 })
    }
  }
  return out
}
