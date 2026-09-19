import type { ReactNode } from "react"

import { cn } from "cn"

/**
 * The frame every table on this product sits in.
 *
 * No surface of its own (030). Nocturne's table is rows on the page: the
 * header's rule at full strength and each row's at 8% of the text, and both
 * rules fade to nothing over 48px at either end rather than stopping at the
 * edge -- the system's signature, painted here once as a row-level strip so
 * the fade spans the row and not each cell. Organic put the whole table in a
 * --well card; that card is gone with its theme.
 *
 * The rows scroll sideways rather than pushing the page wide -- a dynamic
 * column set means any of these tables can outgrow the window, and a
 * horizontal scrollbar on the body moves the nav with it. That scroller is
 * Table's own; this frame does not add a second one.
 *
 * The pager goes in `footer`, which is inside the frame but outside that
 * scroller: it belongs to the table it pages, and a pager that scrolled
 * sideways with the columns would be a pager you have to go looking for.
 *
 * Its own component because ten places had written the same classes out,
 * which is nine places to miss when that answer changes -- as it just did.
 */
export function TableFrame({
  className,
  footer,
  children,
}: {
  className?: string
  /** The pager, and anything else that belongs to the table as a whole. */
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
        // The fading rules: the header's from --border, the rows' from the
        // muted one. Applied to the tr as a bottom-aligned 1px background so
        // Table's own border-b can be turned off underneath it.
        "[&_thead_tr]:border-0 [&_thead_tr]:bg-[linear-gradient(to_right,transparent,var(--border)_48px,var(--border)_calc(100%-48px),transparent)] [&_thead_tr]:bg-[length:100%_1px] [&_thead_tr]:bg-bottom [&_thead_tr]:bg-no-repeat",
        "[&_tbody_tr]:border-0 [&_tbody_tr]:bg-[linear-gradient(to_right,transparent,var(--border-muted)_48px,var(--border-muted)_calc(100%-48px),transparent)] [&_tbody_tr]:bg-[length:100%_1px] [&_tbody_tr]:bg-bottom [&_tbody_tr]:bg-no-repeat",
        className,
      )}
    >
      {children}
      {footer && <div className="flex flex-wrap items-center gap-2.5 px-1">{footer}</div>}
    </div>
  )
}
