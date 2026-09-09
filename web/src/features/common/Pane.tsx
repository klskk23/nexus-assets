import type { ReactNode } from "react"

/**
 * The right-hand pane: a title, a band of facts, and whatever else.
 *
 * Shared by the four panes across two pages (field, group, model, vendor)
 * because the shape of "here is the thing you selected" is one decision. What
 * goes in it is not: `facts` and `children` are the caller's entirely.
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
    <div className="bg-well grid gap-6 rounded-[28px] px-7 py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[26px] leading-tight font-bold">{title}</h2>
        {tag && <span className="text-muted-foreground font-mono text-[13px]">{tag}</span>}
        {action && <div className="ml-auto flex gap-2">{action}</div>}
      </div>
      <dl className="bg-card grid gap-5 rounded-[20px] px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts}
      </dl>
      {children && <div className="grid gap-2.5">{children}</div>}
    </div>
  )
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground mb-1 text-[13px]">{label}</dt>
      <dd className="text-[15px]">{children}</dd>
    </div>
  )
}
