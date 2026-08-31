import { useState } from "react"

import type { Category } from "@/lib/types"
import { cn } from "@/lib/utils"
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

interface Props {
  categories: Category[]
  selectedId: string
  onSelect: (id: string) => void
  onCreateChild: (parent: Category) => void
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

/**
 * The category tree as the table every other list on this product is.
 *
 * Folding stays available from the row menu rather than a chevron in the name
 * cell: a control inside a clickable row fires the row's handler too, which is
 * one click producing two results.
 */
export function CategoryTable({
  categories,
  selectedId,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
}: Props) {
  const [collapsed, setCollapsed] = useState<string[]>([])
  const rows = flattenCategories(categories, collapsed)

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
          {rows.map(({ category: c, depth, hasChildren }) => (
            <ContextMenu key={c.id}>
              <ContextMenuTrigger asChild>
                <TableRow
                  className="cursor-pointer"
                  data-state={c.id === selectedId ? "selected" : undefined}
                  aria-selected={c.id === selectedId}
                  onClick={() => onSelect(c.id)}
                >
                  <TableCell>
                    <span
                      className={cn("inline-block", c.id === selectedId && "font-medium")}
                      style={{ paddingInlineStart: depth * 16 }}
                    >
                      {collapsed.includes(c.id) ? `${c.name} …` : c.name}
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
                <ContextMenuItem onSelect={() => onEdit(c)}>
                  {tMeta.categories.edit}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onCreateChild(c)}>
                  {tMeta.categories.createChild}
                </ContextMenuItem>
                <ContextMenuItem disabled={!hasChildren} onSelect={() => toggle(c.id)}>
                  {collapsed.includes(c.id)
                    ? tMeta.categories.expand
                    : tMeta.categories.collapse}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={() => onDelete(c)}>
                  {tMeta.categories.delete}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
