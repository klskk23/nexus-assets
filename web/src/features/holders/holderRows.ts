import type { HolderEntity } from "@/lib/types"

export interface HolderRow {
  holder: HolderEntity
  depth: number
  hasChildren: boolean
  /** Set only while searching: "国药集团 / 研发部 / 三楼实验室". */
  path?: string
}

/**
 * A bounded walk up the parents.
 *
 * The hierarchy rules make a cycle impossible -- a department's parent must be
 * a company, and a company has no parent -- but a bounded loop costs nothing
 * and one bad row should not hang the page. `categoryRows` says the same thing
 * about the same walk.
 */
function chain(h: HolderEntity, byID: Map<string, HolderEntity>): HolderEntity[] {
  const out: HolderEntity[] = []
  let cur: HolderEntity | undefined = h
  for (let i = 0; cur && i < 64; i++) {
    out.unshift(cur)
    cur = cur.parent_id ? byID.get(cur.parent_id) : undefined
  }
  return out
}

/**
 * Depth-first, with a depth for each row.
 *
 * **Roots are companies and parentless locations side by side**, sorted by
 * name with the type taking no part in it. Putting the companies first is the
 * tempting version and it buries 上海仓库 -- the one people open every day --
 * beneath every company on file. A rail is ordered so a name can be found in
 * it, not so the taxonomy looks tidy.
 *
 * The type is not a section. Splitting the rail into 公司 / 部门 / 位置 would
 * take the one thing this page exists to show -- what hangs from what -- out
 * of the picture and leave it as a line in the pane on the right.
 */
export function flattenHolders(
  items: HolderEntity[],
  isFolded: (id: string, childCount: number) => boolean = () => false,
): HolderRow[] {
  const byName = (a: HolderEntity, b: HolderEntity) => a.name.localeCompare(b.name, "zh")
  const known = new Set(items.map((h) => h.id))
  const children = new Map<string, HolderEntity[]>()
  const roots: HolderEntity[] = []
  for (const h of items) {
    // A parent that is not in the list makes this a root rather than an
    // orphan: dropping the row would hide a holder that exists.
    if (h.parent_id && known.has(h.parent_id)) {
      children.set(h.parent_id, [...(children.get(h.parent_id) ?? []), h])
    } else {
      roots.push(h)
    }
  }

  const out: HolderRow[] = []
  const walk = (list: HolderEntity[], depth: number) => {
    for (const h of [...list].sort(byName)) {
      const kids = children.get(h.id) ?? []
      out.push({ holder: h, depth, hasChildren: kids.length > 0 })
      if (!isFolded(h.id, kids.length)) walk(kids, depth + 1)
    }
  }
  walk(roots, 0)
  return out
}

/**
 * The matches, flat, each carrying the path that says where it sits.
 *
 * Searching cannot keep the indent: showing only the hits removes the parents
 * the indent was measured against, and 三楼实验室 indented twice under nothing
 * claims a position that is not on screen (014 decision 91). The path answers
 * the same question without needing those rows to still be there -- and here
 * it earns its place twice over, because two companies can each have a 三楼实验室.
 *
 * Built by walking `parent_id` rather than read off a stored path: holders
 * have no materialised path column and are not getting one for three levels.
 */
export function searchHolders(items: HolderEntity[], q: string): HolderRow[] {
  const needle = q.trim().toLowerCase()
  const byID = new Map(items.map((h) => [h.id, h]))
  return items
    .filter((h) => h.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"))
    .map((h) => ({
      holder: h,
      depth: 0,
      hasChildren: false,
      path: chain(h, byID)
        .map((n) => n.name)
        .join(" / "),
    }))
}

/**
 * The id of the root this holder hangs from -- itself, if it is one.
 *
 * Walked up through parents, unlike the category version which reads the first
 * segment of a materialised path. Same answer, different source, because these
 * two trees are stored differently.
 */
export function rootIDOf(h: HolderEntity, byID: Map<string, HolderEntity>): string {
  return chain(h, byID)[0]?.id ?? h.id
}

/** How many children each holder has, for the fold control to speak with. */
export function childCounts(items: HolderEntity[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, h) => {
    if (h.parent_id) acc[h.parent_id] = (acc[h.parent_id] ?? 0) + 1
    return acc
  }, {})
}
