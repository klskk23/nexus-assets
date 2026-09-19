import type { ReactNode } from "react"

/**
 * The right-hand pane: a title, a band of facts, and whatever else.
 *
 * Shared by the panes across the four master-detail pages because the shape
 * of "here is the thing you selected" is one decision. What goes in it is
 * not: `facts` and `children` are the caller's entirely.
 *
 * Handoff §5: a card with the small elevation, 20px 24px inside, 20px between
 * blocks; the name at 20px with its code beside it in mono; the facts on a
 * sunk band -- the page's own ground showing through -- with 8px corners and
 * 14px 16px inside.
 */
export function Pane({
  title,
  tag,
  action,
  facts,
  children,
}: {
  title: string
  /** A key, a code, a vendor name -- said quietly beside the title. */
  tag?: string
  action?: ReactNode
  facts: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="bg-card grid gap-5 rounded-md p-[20px_24px] shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-heading text-xl leading-tight">{title}</h2>
        {tag && <span className="text-muted-foreground font-mono text-xs">{tag}</span>}
        {action && <div className="ml-auto flex gap-2.5">{action}</div>}
      </div>
      <dl className="bg-well grid gap-4 rounded-md p-[14px_16px] sm:grid-cols-2 lg:grid-cols-4">
        {facts}
      </dl>
      {children && <div className="grid gap-2.5">{children}</div>}
    </div>
  )
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-neutral-500 mb-1 text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}
