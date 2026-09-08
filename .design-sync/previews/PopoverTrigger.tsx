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
 * `asChild` with a real Button: the trigger renders no element of its own, it
 * hands its props to the child. Without `asChild` you get a bare `<button>`
 * with none of the design language on it.
 *
 * The trigger doubles as the readout -- it shows the range that is currently
 * filtering the list, so the filter bar states its own state.
 */
export const AsChildButton = () => (
  <div style={{ minHeight: 400 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="日期范围" className="justify-start font-normal">
          2026-08-01 – 2026-08-31
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={new Date(2026, 7, 1)}
          selected={{ from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) }}
        />
      </PopoverContent>
    </Popover>
  </div>
)

/**
 * An icon-sized trigger next to the thing it explains. It still needs an
 * `aria-label`: a glyph is not a name, and this is the control a keyboard
 * reader lands on.
 */
export const IconSized = () => (
  <div style={{ minHeight: 260 }}>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">保留策略</span>
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="关于保留策略">
            ⓘ
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <PopoverHeader>
            <PopoverTitle>审计日志保留 365 天</PopoverTitle>
            <PopoverDescription>
              超过一年的流转记录会被清理，设备本身的时间线不受影响。
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </div>
  </div>
)
