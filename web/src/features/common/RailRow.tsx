import type { ReactNode } from "react"
import { Link } from "react-router"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "cn"

interface Props {
  to: string
  label: string
  /** Shown at the end of the row. Written out at 0 -- a blank reads as
   *  "not loaded", which is a different answer from "none". */
  count?: number | string
  depth?: number
  selected?: boolean
  /** Present only on a node that has children to hide. */
  folded?: boolean
  onFold?: () => void
  foldLabel?: string
  children?: ReactNode
}

/**
 * One line in a left-hand rail: a name, maybe a number, maybe a twisty.
 *
 * The row is the link, so nothing clickable goes inside it -- one click must
 * not produce two answers. The fold control is the exception and it earns it
 * by sitting outside the link rather than within: it is a separate button
 * beside the row, not a control in a cell (docs/rules/web-tables.md).
 *
 * Shared by the three rails rather than copied into each: what a row looks
 * like is one decision, and it had already drifted between two of them by the
 * time the third arrived.
 */
export function RailRow({
  to,
  label,
  count,
  depth = 0,
  selected = false,
  folded,
  onFold,
  foldLabel,
}: Props) {
  return (
    <div className="flex items-center">
      {folded === undefined ? (
        <span aria-hidden className="w-0 shrink-0" style={{ width: depth * 18 }} />
      ) : (
        <button
          type="button"
          onClick={onFold}
          aria-label={foldLabel}
          aria-expanded={!folded}
          className="text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center rounded-full"
          style={{ marginInlineStart: depth * 18 }}
        >
          {folded ? <ChevronRightIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
        </button>
      )}
      <Link
        to={to}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-[9px] pr-3.5 pl-3 text-sm transition-colors",
          selected
            ? "bg-accent text-accent-foreground font-semibold"
            : "hover:bg-accent hover:text-accent-foreground",
          !selected && depth > 0 && "text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate" title={label}>
          {label}
        </span>
        {count !== undefined && (
          <span className="shrink-0 text-[13px] tabular-nums">{count}</span>
        )}
      </Link>
    </div>
  )
}

/** A heading in a rail. Not a link -- it is not a thing you can open. */
export function RailHeading({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground px-3.5 pt-3 pb-1 text-xs tracking-wide">{children}</div>
  )
}
