import type { ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  searchID: string
  searchHint: string
  search: string
  onSearch: (q: string) => void
  /** The rows. Whoever renders them owns what a row is. */
  children: ReactNode
  /** Paging, when the list has more than one page. */
  pager?: ReactNode
  /** What can be created from here. */
  actions?: ReactNode
}

/**
 * The frame around a left-hand rail: a search box, some rows, and a foot.
 *
 * Frame only. It does not know whether the rows are a tree, how they are
 * ordered, what a row shows, or what the buttons at the bottom create -- three
 * pages use it and all three answer those differently.
 *
 * An `Input` rather than `ListToolbar`: that one is built for the strip above
 * a table, full width with room for filter controls, and putting it in a 300px
 * rail brings its assumptions along with its markup. Same judgement 024 made.
 */
export function Rail({
  searchID,
  searchHint,
  search,
  onSearch,
  children,
  pager,
  actions,
}: Props) {
  return (
    <div className="bg-well grid gap-2.5 rounded-[28px] p-3">
      <Label htmlFor={searchID} className="sr-only">
        {searchHint}
      </Label>
      <Input
        id={searchID}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={searchHint}
        className="bg-background"
      />
      {/* min-w-0 on the list and on every row.
       *
       * A grid item defaults to min-width:auto, so a row holding anything
       * that refuses to shrink sizes itself to its content and walks straight
       * out of a 300px rail -- taking the truncation with it, because the name
       * inside has no boundary left to truncate against. That is what a badge
       * and a type label did to the holders rail: rows 346px wide in a 300px
       * card. The rule belongs here rather than in each caller: "a row never
       * exceeds the rail" is the frame's business. */}
      <ul className="grid min-w-0 gap-0.5 [&>li]:min-w-0">{children}</ul>
      {pager}
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  )
}
