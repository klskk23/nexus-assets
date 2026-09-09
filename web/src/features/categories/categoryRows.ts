import type { Category } from "@/lib/types"

export interface CategoryRow {
  category: Category
  depth: number
  hasChildren: boolean
  /** Set only while searching: "网络设备 / SDWAN 路由器". */
  path?: string
}

/**
 * Depth-first order with a depth for each row.
 *
 * A list cannot nest, so the hierarchy lives in the order and the indent. The
 * server already returns categories ordered by path, which is depth-first, but
 * the parent links are re-walked here rather than trusted: silently dropping a
 * category whose parent sorted after it would be worse than being slow.
 *
 * Folding is conditional (025): a node whose children would fill the rail on
 * their own starts closed and says how many are behind it. 024 removed folding
 * outright and CollapsibleTree was deleted for it before that -- both times
 * the objection was a control that hides half the answer to "what is there".
 * What is different is that the reader is now told what they are not seeing,
 * which is the piece both earlier attempts were missing.
 */
export function flattenCategories(
  items: Category[],
  isFolded: (id: string, childCount: number) => boolean = () => false,
): CategoryRow[] {
  const children = new Map<string, Category[]>()
  const roots: Category[] = []
  const known = new Set(items.map((c) => c.id))
  for (const c of items) {
    if (c.parent_id && known.has(c.parent_id)) {
      children.set(c.parent_id, [...(children.get(c.parent_id) ?? []), c])
    } else {
      roots.push(c)
    }
  }

  const out: CategoryRow[] = []
  const walk = (list: Category[], depth: number) => {
    for (const c of list) {
      const kids = children.get(c.id) ?? []
      out.push({ category: c, depth, hasChildren: kids.length > 0 })
      if (!isFolded(c.id, kids.length)) walk(kids, depth + 1)
    }
  }
  walk(roots, 0)
  return out
}

/**
 * The matches, flattened, each carrying the path that says where it sits.
 *
 * Searching a tree cannot keep the indent: showing only the hits removes the
 * parents the indent was measured against, and "SDWAN 路由器" indented twice
 * under nothing is a claim about a place that is not on screen. The full path
 * on one line answers the same question -- where is it -- without needing the
 * rows above it to still be there.
 */
export function searchCategories(items: Category[], q: string): CategoryRow[] {
  const needle = q.trim().toLowerCase()
  const byId = new Map(items.map((c) => [c.id, c]))
  const pathOf = (c: Category) => {
    const names: string[] = []
    // A cycle is impossible by construction, but a bounded walk costs nothing
    // and a hung table costs the page.
    let cur: Category | undefined = c
    for (let i = 0; cur && i < 64; i++) {
      names.unshift(cur.name)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return names.join(" / ")
  }
  return items
    .filter(
      (c) =>
        c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle),
    )
    .map((c) => ({ category: c, depth: 0, hasChildren: false, path: pathOf(c) }))
}

/**
 * The id of the root this category hangs from -- itself, if it is one.
 *
 * Read off the materialised path rather than walked up through parents: the
 * path is what the server maintains and what every ancestor query in this
 * product already uses, and a second way of answering "which chain is this in"
 * is a second thing that can disagree.
 */
export function rootIDOf(c: Category): string {
  const [first] = c.path.split("/").filter(Boolean)
  return first ?? c.id
}
