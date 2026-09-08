import type { ReactNode } from "react"

import { cn } from "cn"

/**
 * The frame every table on this product sits in.
 *
 * An outlined container on the page ground -- not a card. A table is the page's
 * content, not something floating above it, so it keeps the page's own ground
 * and earns its edge from the border and the 28px corner. `--card` is reserved
 * for things that genuinely float: dialogs, drawers, the sticky bulk bar.
 *
 * It scrolls sideways on its own rather than pushing the page wide -- a dynamic
 * column set means any of these tables can outgrow the window, and a horizontal
 * scrollbar on the body moves the nav with it.
 *
 * Its own component because ten places had written the same three classes out,
 * which is nine places to miss when that answer changes.
 */
export function TableFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-[28px] border bg-background", className)}>
      {children}
    </div>
  )
}
