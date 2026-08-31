import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { zh } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface TreeNode {
  id: string
  label: string
  children: TreeNode[]
}

interface Props {
  nodes: TreeNode[]
  selectedId?: string
  onSelect?: (id: string) => void
}

/**
 * A tree built from shadcn/ui primitives.
 *
 * shadcn/ui has no dedicated Tree component. Rather than reach for a custom one
 * -- which the constitution says needs prior approval -- this composes
 * Collapsible and Button recursively, which covers expand, collapse, indentation
 * and selection. If deep trees ever make this unworkable, stop and ask before
 * introducing a tree component.
 */
export function CollapsibleTree({ nodes, selectedId, onSelect }: Props) {
  return (
    <ul className="flex flex-col gap-0.5" role="tree">
      {nodes.map((n) => (
        <TreeItem key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  )
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: TreeNode
  depth: number
  selectedId?: string
  onSelect?: (id: string) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const hasChildren = node.children.length > 0
  const selected = node.id === selectedId

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1" style={{ paddingInlineStart: depth * 16 }}>
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label={open ? zh.common.collapse(node.label) : zh.common.expand(node.label)}
              >
                <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
              </Button>
            </CollapsibleTrigger>
          ) : (
            <span className="size-6 shrink-0" />
          )}
          <Button
            variant={selected ? "secondary" : "ghost"}
            size="sm"
            className="h-7 justify-start font-normal"
            onClick={() => onSelect?.(node.id)}
          >
            {node.label}
          </Button>
        </div>

        {hasChildren && (
          <CollapsibleContent>
            <ul className="flex flex-col gap-0.5" role="group">
              {node.children.map((c) => (
                <TreeItem key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
              ))}
            </ul>
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  )
}

/** Builds a tree from the flat category list the API returns. */
export function buildTree(items: { id: string; name: string; parent_id: string | null }[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  items.forEach((i) => byId.set(i.id, { id: i.id, label: i.name, children: [] }))
  const roots: TreeNode[] = []
  items.forEach((i) => {
    const node = byId.get(i.id)!
    const parent = i.parent_id ? byId.get(i.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}
