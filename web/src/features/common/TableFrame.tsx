import type { ReactNode } from "react"

import { cn } from "cn"

/**
 * The frame every table on this product sits in.
 *
 * It sits on --well, the same tone as the shell behind the panel and as every
 * other content block on this product (the import steps, the attribute group,
 * the print jobs, the overview's paired blocks). A table is a block of content
 * like those, so it wears what they wear. `--card` stays reserved for things
 * that genuinely float: dialogs, drawers, the sticky bulk bar.
 *
 * The rows scroll sideways rather than pushing the page wide -- a dynamic
 * column set means any of these tables can outgrow the window, and a
 * horizontal scrollbar on the body moves the nav with it. That scroller is
 * Table's own; this frame does not add a second one, which it briefly did and
 * which left the outer never scrolling while the inner did all the work.
 *
 * The pager goes in `footer`, which is inside the frame but outside that
 * scroller: it belongs to the table it pages, and a pager that scrolled
 * sideways with the columns would be a pager you have to go looking for.
 * Below the frame it was also the first thing the sticky bulk bar covered.
 *
 * Its own component because ten places had written the same three classes out,
 * which is nine places to miss when that answer changes.
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
    <div className={cn("bg-well overflow-hidden rounded-[28px] border", className)}>
      {children}
      {footer && <div className="border-border-muted border-t px-5 py-3">{footer}</div>}
    </div>
  )
}
