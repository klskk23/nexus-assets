import {
  Button,
  Calendar,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "nexus-assets-web"

/**
 * The date-range filter on the asset list and the audit log -- the one job
 * Popover has in this product, and the reason there is no `<input type="date">`
 * anywhere in it. A button showing the range you picked opens a two-month
 * `Calendar` with `mode="range"`; typing 2026-08-01 into a text box is not a
 * thing anyone is asked to do here.
 *
 * `defaultMonth` lands the calendar on the range you already chose, not on
 * today: a filter set last March is otherwise one month button at a time away
 * from being read back.
 */
export const DateRangeFilter = () => (
  <div style={{ minHeight: 420 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="日期范围" className="justify-start font-normal">
          2026-08-01 – 2026-08-31
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={new Date(2026, 7, 1)}
          selected={{ from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) }}
        />
        <div className="border-t p-2">
          <Button variant="ghost" size="sm">
            清除日期
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)

/**
 * The other shape: a short explanation hung off a control, opened on purpose
 * rather than on hover. Use a Popover rather than a Tooltip when the text is a
 * sentence people need to read twice, or when it holds a control of its own --
 * a tooltip closes the moment you reach for it.
 */
export const Explainer = () => (
  <div style={{ minHeight: 240 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          归还规则 ⓘ
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>归还后落到哪个状态</PopoverTitle>
          <PopoverDescription>
            归还一台设备会把它写回“在库”，并记一条流转。要送修请直接改为“维修中”，
            不必先归还。
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)
