import type { ReactNode } from "react"

import { TruncatedTip, useTruncated } from "@/features/common/Ellipsis"

import { cn } from "cn"

export interface BarRow {
  id: string
  /** What the row is: a category's name, or a status chip. */
  label: ReactNode
  count: number
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
 * Used twice: across categories, and across statuses. One component rather
 * than two, because the row is the same row -- a name, a proportional track
 * and a count -- and the second copy would have drifted from the first the
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
 * Bars alternate clay and sage by position. The alternation carries no
 * information -- it is rhythm, the same job the zebra striping of a long table
 * does, and a reader who looks for a meaning in it will not find one.
 *
 * What it must not become is the status colour. A status row already says its
 * status in the chip; painting the bar to match would say the same thing twice,
 * in tints that measure 1.0x against this page and could not carry it anyway.
 *
 * Proportions are against the largest row, not the total. Against the
 * total, a realistic ledger draws twelve slivers and one bar: the question this
 * answers is which categories are big, and relative length is what answers it.
 * The count beside each bar is the absolute number, so nothing is lost.
 */
export function DistributionBar({ data, onSelect, rowLabel }: Props) {
  const largest = Math.max(...data.map((d) => d.count), 1)

  return (
    <ul className="grid gap-2">
      {data.map((d, i) => (
        <li key={d.id}>
          <Row
            label={typeof d.label === "string" ? d.label : rowLabel(d)}
            onSelect={() => onSelect(d.id)}
            ariaLabel={rowLabel(d)}
            alternate={i % 2 === 0}
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
 * A category called 「超长名称用来把左栏撑破的测试对象名」 is 104px of track
 * away from being readable at all. The trigger is the button rather than the
 * name inside it, so tabbing along the chart opens them too.
 */
function Row({
  label,
  ariaLabel,
  onSelect,
  alternate,
  count,
  largest,
  children,
}: {
  label: string
  ariaLabel: string
  onSelect: () => void
  alternate: boolean
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
        className="grid w-full grid-cols-[104px_1fr_46px] items-center gap-4 rounded-full py-1.5 text-left text-sm transition-opacity hover:opacity-[.72]"
      >
        <span className="flex min-w-0 items-center">
          <span ref={ref} className="truncate">
            {children}
          </span>
        </span>
        {/* aria-hidden: the button's own label already says the name and the
            count, and a track read out as well would say it a second time. */}
        <span aria-hidden className="bg-background h-[18px] overflow-hidden rounded-full">
          {/* display:block, not inline: a percentage width on an inline box
                  is ignored and every bar would come out the width of nothing.
                  min-width so a row with one device is still a mark rather than
                  a hairline that looks like zero -- but not at zero itself,
                  where a mark would be claiming there is a little of something
                  there. Statuses are commonly zero; categories rarely are,
                  which is why this only showed up once the two shared a row. */}
          {count > 0 && (
            <span
              className={cn(
                "block h-full min-w-1 rounded-full",
                // Alternating, so neighbouring rows are told apart by colour as
                // well as by length. The alternation is by position and says
                // nothing about the row -- see the note above the component.
                alternate ? "bg-primary" : "bg-accent-2",
              )}
              style={{ width: `${(count / largest) * 100}%` }}
            />
          )}
        </span>
        <span className="font-heading text-right tabular-nums">{count}</span>
      </button>
    </TruncatedTip>
  )
}
