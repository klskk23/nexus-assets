import type { ReactNode } from "react"

import { Hint } from "@/features/common/Hint"

interface Props {
  title: ReactNode
  /**
   * What the page is for, behind the question mark beside its title.
   *
   * It used to be a line of prose under the heading, which put an
   * explanation somebody reads once above the table they came for -- and
   * pushed that table down the screen every single visit.
   */
  hint?: string
  /** The page's own actions, at the end of the row. */
  children?: ReactNode
}

/**
 * The top of every page: what this is, optionally why, and what can be done
 * with it.
 *
 * One component rather than a heading written out on each page, because the
 * eleven of them had drifted -- some pushed the buttons over with `ml-auto` on
 * the heading, some with `ml-auto` on the first button, and the gap between
 * the heading and the content below was 5 on three pages and 6 on the rest.
 * None of that is a decision any single page should be making.
 */
export function PageHeader({ title, hint, children }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="mr-auto flex flex-wrap items-center gap-2 text-xl font-semibold">
        {title}
        {hint && <Hint>{hint}</Hint>}
      </h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
