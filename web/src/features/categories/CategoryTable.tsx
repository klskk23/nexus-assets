import { useState } from "react"

import type { Category } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface CategoryRow {
  category: Category
  depth: number
  hasChildren: boolean
  /** Set only while searching: "网络设备 / SDWAN 路由器". */
  path?: string
}

/**
 * Depth-first order with a depth for each row, skipping what is folded away.
 *
 * A table cannot nest, so the hierarchy lives in the order and the indent. The
 * server already returns categories ordered by path, which is depth-first, but
 * the parent links are re-walked here rather than trusted: a table that
 * silently drops a category whose parent sorted after it would be worse than
 * one that is slow.
 */
export function flattenCategories(items: Category[], collapsed: string[]): CategoryRow[] {
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
      if (!collapsed.includes(c.id)) walk(kids, depth + 1)
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

interface Props {
  categories: Category[]
  /** Non-empty switches the tree to a flat list of matches with their paths. */
  search?: string
  /** Clicking a row opens it, the way every other table on the product does. */
  onOpen: (category: Category) => void
  onCreateChild: (parent: Category) => void
}

/**
 * The category tree as the table every other list on this product is.
 *
 * Folding stays in the row menu rather than a chevron in the name cell: a
 * control inside a clickable row fires the row's handler too, which is one
 * click producing two results. Deleting lives in the editor the row opens,
 * where the confirmation can name the models it would detach.
 */
export function CategoryTable({ categories, search = "", onOpen, onCreateChild }: Props) {
  const [collapsed, setCollapsed] = useState<string[]>([])
  const rows = search.trim()
    ? searchCategories(categories, search)
    : flattenCategories(categories, collapsed)

  const toggle = (id: string) =>
    setCollapsed((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const nameOf = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? t.common.none

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tMeta.categories.name}</TableHead>
            <TableHead>{tMeta.categories.code}</TableHead>
            <TableHead>{tMeta.categories.parent}</TableHead>
            <TableHead>{tMeta.categories.displayKey}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ category: c, depth, hasChildren, path }) => (
            <ContextMenu key={c.id}>
              <ContextMenuTrigger asChild>
                <TableRow className="cursor-pointer" onClick={() => onOpen(c)}>
                  <TableCell>
                    <span
                      className="inline-block"
                      style={{ paddingInlineStart: depth * 16 }}
                    >
                      {path ?? (collapsed.includes(c.id) ? `${c.name} …` : c.name)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono">{c.code}</TableCell>
                  <TableCell>{nameOf(c.parent_id)}</TableCell>
                  <TableCell className="font-mono">
                    {c.display_key || <span className="font-sans">{t.common.none}</span>}
                  </TableCell>
                </TableRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onOpen(c)}>
                  {tMeta.categories.edit}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onCreateChild(c)}>
                  {tMeta.categories.createChild}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!hasChildren} onSelect={() => toggle(c.id)}>
                  {collapsed.includes(c.id)
                    ? tMeta.categories.expand
                    : tMeta.categories.collapse}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
