import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The frame every table on this product sits in.
 *
 * Bordered, and scrolling sideways on its own rather than pushing the page
 * wide -- a dynamic column set means any of these tables can outgrow the
 * window, and a horizontal scrollbar on the body moves the nav with it.
 *
 * Its own component because ten places had written the same three classes out,
 * which is nine places to miss when that answer changes.
 */
export function TableFrame({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("overflow-x-auto rounded-md border", className)}>{children}</div>
}
