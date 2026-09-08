import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "nexus-assets-web"

/**
 * PopoverHeader is the small stack at the top of a panel: it supplies the
 * column and the 4px gap between title and description, and nothing else. Put
 * PopoverTitle and PopoverDescription inside it and add no margins of your own.
 */
export const TitleAndDescription = () => (
  <div style={{ minHeight: 260 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          保留策略
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
)

/**
 * The header sits above whatever the panel is actually for -- here a pair of
 * buttons. The gap between the header and the body is the body's to set, which
 * keeps the header the same two lines in every panel that has one.
 */
export const AboveTheControls = () => (
  <div style={{ minHeight: 300 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          标记为已报废
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>报废这 3 台设备</PopoverTitle>
          <PopoverDescription>
            设备会从在库数里消失，历史流转仍然保留。
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex items-center gap-2" style={{ marginTop: "0.75rem" }}>
          <Button size="sm" variant="destructive">
            确认报废
          </Button>
          <Button variant="ghost" size="sm">
            取消
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)
