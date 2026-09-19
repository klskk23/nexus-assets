import type { ReactNode } from "react"

import { TruncatedTip, useTruncated } from "@/features/common/Ellipsis"

import { cn } from "cn"

export interface BarRow {
  id: string
  /** What the row is: a category's name, or a status chip. */
  label: ReactNode
  count: number
  /**
   * The fill's colour, as a class. The handoff gives each distribution its
   * own: a status row takes that status's bar tone (`status-<slot>` plus
   * `bg-[var(--status-line)]`), categories the accent's 600 step, owners
   * neutral-500. Absent means the category fill.
   */
  bar?: string
}

interface Props {
  data: BarRow[]
  onSelect: (id: string) => void
  /** Read out in place of the row, which is a label, a track and a number. */
  rowLabel: (row: BarRow) => string
}

/**
 * How the devices are spread across something, as a row of tracks.
 *
 * Used three times: across categories, statuses and owners. One component
 * rather than three, because the row is the same row -- a name, a proportional
 * track and a count -- and a second copy would have drifted from the first the
 * moment either was touched.
 *
 * This replaced a charting library, and the library is gone with it: it was a
 * 354 KB lazy chunk drawing one series of horizontal bars with no axes worth
 * reading, which is a track with a fill. The proportions are the whole of the
 * information and CSS states them exactly.
 *
 * Each row is a button, because the bar is the way into that category's list --
 * the chart's click handler used to be the only route and was invisible to a
 * keyboard.
 *
 * The fill's colour is the caller's (see BarRow.bar). What it must not be is a
 * status colour on a row that is not a status: colour on this product means
 * state, and a chart may not borrow a meaning it does not have.
 *
 * Proportions are against the largest row, not the total. Against the
 * total, a realistic ledger draws twelve slivers and one bar: the question this
 * answers is which categories are big, and relative length is what answers it.
 * The count beside each bar is the absolute number, so nothing is lost.
 */
export function DistributionBar({ data, onSelect, rowLabel }: Props) {
  const largest = Math.max(...data.map((d) => d.count), 1)

  return (
    <ul className="grid">
      {data.map((d) => (
        <li key={d.id}>
          <Row
            label={typeof d.label === "string" ? d.label : rowLabel(d)}
            onSelect={() => onSelect(d.id)}
            ariaLabel={rowLabel(d)}
            bar={d.bar}
            count={d.count}
            largest={largest}
          >
            {d.label}
          </Row>
        </li>
      ))}
    </ul>
  )
}

/**
 * One bar, and the tooltip that says the whole name when it does not fit.
 *
 * The handoff's row: 96px 1fr 40px, a 6px track on the deepest neutral step,
 * 3px 4px of padding pulled out by -4px so the hover tint reaches the edge.
 * The trigger is the button rather than the name inside it, so tabbing along
 * the chart opens them too.
 */
function Row({
  label,
  ariaLabel,
  onSelect,
  bar,
  count,
  largest,
  children,
}: {
  label: string
  ariaLabel: string
  onSelect: () => void
  bar?: string
  count: number
  largest: number
  children: ReactNode
}) {
  const { ref, isTruncated } = useTruncated<HTMLSpanElement>()
  return (
    <TruncatedTip text={label} isTruncated={isTruncated}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={ariaLabel}
        className="-mx-1 grid w-[calc(100%+8px)] grid-cols-[96px_1fr_40px] items-center gap-2.5 rounded-sm px-1 py-[3px] text-left text-[13px] hover:bg-foreground/5"
      >
        <span className="flex min-w-0 items-center">
          <span ref={ref} className="truncate">
            {children}
          </span>
        </span>
        {/* aria-hidden: the button's own label already says the name and the
            count, and a track read out as well would say it a second time. */}
        <span aria-hidden className="bg-neutral-900 h-1.5 overflow-hidden rounded-[3px]">
          {/* display:block, not inline: a percentage width on an inline box
              is ignored and every bar would come out the width of nothing.
              min-width so a row with one device is still a mark rather than
              a hairline that looks like zero -- but not at zero itself,
              where a mark would be claiming there is a little of something
              there. */}
          {count > 0 && (
            <span
              className={cn("block h-full min-w-1 rounded-[3px]", bar ?? "bg-accent-600")}
              style={{ width: `${(count / largest) * 100}%` }}
            />
          )}
        </span>
        <span className="text-neutral-300 text-right tabular-nums">{count}</span>
      </button>
    </TruncatedTip>
  )
}
