import { Button, Calendar } from "nexus-assets-web"

/**
 * The only date control this product ships. `<input type="date">` is
 * deliberately never used: its picker is the browser's, it is unstyled, it
 * disagrees between Chrome and Safari, and it cannot express a range at all.
 *
 * On the asset and audit pages this lives inside a Popover -- an outline
 * button showing the chosen range, and `PopoverContent className="w-auto p-0"`
 * so the month sits flush in it. Shown here without the Popover so the month
 * itself is legible.
 *
 * The locale comes from `getLang()` in the product (`zhCN` / `enUS`). These
 * cards pin the Chinese month caption and weekday letters with `formatters`,
 * which is the same rendering without importing a locale the preview package
 * does not re-export.
 */
const zhFormatters = {
  formatCaption: (month: Date) => `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`,
  formatWeekdayName: (weekday: Date) => "日一二三四五六"[weekday.getDay()],
}

/* Preview glue only. Calendar paints itself `bg-background`; the preview sheet's
   ground is white where the product's is cream, so without this the month reads
   as a tan chip rather than as the page it actually sits on. In the product the
   Popover it lives in makes it transparent instead. */
const ground = { background: "var(--background)", padding: "1rem" } as const

export const AuditDateRange = () => (
  <div style={ground}>
    <Calendar
      mode="range"
      numberOfMonths={2}
      defaultMonth={new Date(2026, 7, 1)}
      selected={{ from: new Date(2026, 7, 3), to: new Date(2026, 7, 14) }}
      onSelect={() => {}}
      formatters={zhFormatters}
    />
  </div>
)

/**
 * One month, for the narrower filter row on the asset list. Reopening the
 * picker lands on the range that was chosen, not on today -- otherwise a
 * filter set last March is one month button at a time away from being read
 * back.
 */
export const OneMonth = () => (
  <div style={ground}>
    <Calendar
      mode="range"
      defaultMonth={new Date(2026, 8, 1)}
      selected={{ from: new Date(2026, 8, 2), to: new Date(2026, 8, 8) }}
      onSelect={() => {}}
      formatters={zhFormatters}
    />
  </div>
)

/**
 * A range still being drawn -- only its first day has been pressed -- and the
 * footer the product puts under the month, so a date filter can be taken off
 * without guessing which day cancels it.
 */
export const HalfChosenWithClear = () => (
  <div style={ground}>
    <Calendar
      mode="range"
      defaultMonth={new Date(2026, 8, 1)}
      selected={{ from: new Date(2026, 8, 8), to: undefined }}
      onSelect={() => {}}
      formatters={zhFormatters}
    />
    <div className="border-t p-2">
      <Button variant="ghost" size="sm">
        清除日期
      </Button>
    </div>
  </div>
)
