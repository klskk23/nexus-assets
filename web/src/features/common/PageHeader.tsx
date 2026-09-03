import type { ReactNode } from "react"

interface Props {
  title: ReactNode
  /** One line under the title, when the page needs to say what it is for. */
  description?: string
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
export function PageHeader({ title, description, children }: Props) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="mr-auto grid gap-1">
        <h1 className="flex flex-wrap items-center gap-3 text-xl font-semibold">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
