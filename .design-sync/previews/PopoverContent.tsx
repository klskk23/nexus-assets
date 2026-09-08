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
 * `className="w-auto p-0"` is the pairing a calendar needs: the default `w-72`
 * would crop a month grid, and the default `p-4` would double the padding the
 * Calendar already carries. Strip both and let the content size the panel.
 *
 * `align="start"` keeps the panel's left edge on the trigger's, so a picker
 * wider than its button grows inward instead of off the filter bar.
 */
export const SizedByItsContent = () => (
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
 * Left alone it is a 288px panel with its own padding -- the right size for a
 * couple of sentences and a control, and the size to keep unless the content
 * genuinely cannot live in it.
 */
export const DefaultPanel = () => (
  <div style={{ minHeight: 300 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          批量导出
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>导出当前筛选结果</PopoverTitle>
          <PopoverDescription>
            按现在的筛选条件导出 137 条记录，显示列即导出列。
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex items-center gap-2" style={{ marginTop: "0.75rem" }}>
          <Button size="sm">导出 CSV</Button>
          <Button variant="ghost" size="sm">
            取消
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)

/**
 * `side="right"` with an offset -- what a panel does when its trigger sits low
 * on the page and there is no room beneath it. Collision handling will flip it
 * back on its own, so set a side only when you mean it.
 */
export const ToTheSide = () => (
  <div style={{ minHeight: 240 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          上海仓库
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>上海仓库</PopoverTitle>
          <PopoverDescription>在库 41 台 · 维修中 3 台 · 已签出 12 台</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)
