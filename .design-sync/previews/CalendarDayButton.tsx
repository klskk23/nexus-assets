import { Calendar, CalendarDayButton } from "nexus-assets-web"

/**
 * One day cell. It is a `Button` underneath -- ghost variant, icon size, made
 * square -- which is why the days pick up the same focus ring and the same
 * pressed feel as every other control in the product.
 *
 * It takes a `day` and a `modifiers` object from react-day-picker, so it is
 * never rendered on its own: `Calendar` already installs it as its `DayButton`
 * component, and these cards pass it explicitly to say which part is the
 * subject.
 *
 * The four states worth recognising are all data attributes it sets from the
 * modifiers: `data-selected-single`, `data-range-start`, `data-range-middle`,
 * `data-range-end`. Start and end take the terracotta primary; the middle
 * takes the flat accent and loses its corners so the run reads as one bar.
 */
/** The preview sheet's ground is white; the product's is cream. Calendar
 *  paints itself `bg-background`, so without this the month renders as a tan
 *  chip on white and reads as a highlight rather than as the page. */
const ground = { background: "var(--background)", padding: "1rem" } as const

const zhFormatters = {
  formatCaption: (month: Date) => `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`,
  formatWeekdayName: (weekday: Date) => "日一二三四五六"[weekday.getDay()],
}

export const AcrossARange = () => (
  <Calendar
    mode="range"
    defaultMonth={new Date(2026, 7, 1)}
    selected={{ from: new Date(2026, 7, 5), to: new Date(2026, 7, 19) }}
    onSelect={() => {}}
    components={{ DayButton: CalendarDayButton }}
    formatters={zhFormatters}
  />
)

/** A single selected day: no start, no middle, no end -- `data-selected-single`
 *  on its own, which is the rounded terracotta cell. */
export const OneDaySelected = () => (
  <Calendar
    mode="single"
    defaultMonth={new Date(2026, 8, 1)}
    selected={new Date(2026, 8, 8)}
    onSelect={() => {}}
    components={{ DayButton: CalendarDayButton }}
    formatters={zhFormatters}
  />
)

/**
 * Days the ledger has nothing to say about are disabled rather than hidden:
 * the audit log starts when the installation did, and a month with a hole in
 * it reads as a rendering fault. Outside days stay visible and dimmed for the
 * same reason.
 */
export const WithDisabledDays = () => (
  <Calendar
    mode="range"
    defaultMonth={new Date(2026, 8, 1)}
    selected={{ from: new Date(2026, 8, 2), to: new Date(2026, 8, 6) }}
    onSelect={() => {}}
    disabled={{ after: new Date(2026, 8, 8) }}
    components={{ DayButton: CalendarDayButton }}
    formatters={zhFormatters}
  />
)
