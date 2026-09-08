import { tOverview } from "@/i18n"

export interface CategoryCount {
  category_id: string
  name: string
  count: number
}

interface Props {
  data: CategoryCount[]
  onSelect: (categoryID: string) => void
}

/**
 * How the devices are spread across categories, as a row of tracks.
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
 * Proportions are against the largest category, not the total. Against the
 * total, a realistic ledger draws twelve slivers and one bar: the question this
 * answers is which categories are big, and relative length is what answers it.
 * The count beside each bar is the absolute number, so nothing is lost.
 */
export function DistributionBar({ data, onSelect }: Props) {
  const largest = Math.max(...data.map((d) => d.count), 1)

  return (
    <ul className="grid gap-2">
      {data.map((d) => (
        <li key={d.category_id}>
          <button
            type="button"
            onClick={() => onSelect(d.category_id)}
            aria-label={`${d.name} ${d.count} ${tOverview.unit}`}
            className="grid w-full grid-cols-[104px_1fr_46px] items-center gap-4 rounded-full py-1.5 text-left text-sm transition-opacity hover:opacity-[.72]"
          >
            <span className="truncate" title={d.name}>
              {d.name}
            </span>
            {/* aria-hidden: the button's own label already says the name and the
                count, and a track read out as well would say it a second time. */}
            <span aria-hidden className="bg-well h-[18px] overflow-hidden rounded-full">
              {/* display:block, not inline: a percentage width on an inline box
                  is ignored and every bar would come out the width of nothing.
                  min-width so a category with one device is still a mark rather
                  than a hairline that looks like zero. */}
              <span
                className="bg-accent-2 block h-full min-w-1 rounded-full"
                style={{ width: `${(d.count / largest) * 100}%` }}
              />
            </span>
            <span className="font-heading text-right tabular-nums">{d.count}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
