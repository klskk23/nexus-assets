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
      <ul className="grid gap-0.5">{children}</ul>
      {pager}
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  )
}
