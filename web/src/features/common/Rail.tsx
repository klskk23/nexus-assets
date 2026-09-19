import type { ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useComposedInput } from "./useComposedInput"

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
 * ordered, what a row shows, or what the buttons at the bottom create -- four
 * pages use it and all four answer those differently.
 *
 * No surface of its own (030): the handoff draws the rail straight on the
 * page -- a 32px search box, then the rows -- and the detail pane beside it
 * is the one that lifts. Organic gave the rail a card; that card is gone.
 *
 * An `Input` rather than `ListToolbar`: that one is built for the strip above
 * a table, full width with room for filter controls, and putting it in a 280px
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
  const composed = useComposedInput(search, onSearch)

  return (
    <div className="grid gap-2.5">
      <Label htmlFor={searchID} className="sr-only">
        {searchHint}
      </Label>
      {/* Spread rather than value+onChange: an IME needs the composition
          events too, or a half-typed pinyin goes into the address bar and
          comes back on top of the word being written. */}
      <Input id={searchID} size="rail" {...composed} placeholder={searchHint} />
      {/* min-w-0 on the list and on every row.
       *
       * A grid item defaults to min-width:auto, so a row holding anything
       * that refuses to shrink sizes itself to its content and walks straight
       * out of a 280px rail -- taking the truncation with it, because the name
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
