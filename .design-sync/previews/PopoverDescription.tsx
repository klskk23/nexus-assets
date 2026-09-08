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
 * The muted sentence under the title. It is a real `<p>` with the muted colour
 * already on it -- do not hand-roll `<p className="text-sm text-muted-foreground">`
 * next to a title and call it a description; that is how a set of panels ends
 * up with three different greys.
 *
 * Write it as a sentence that a reader can act on, not a restatement of the
 * title.
 */
export const UnderTheTitle = () => (
  <div style={{ minHeight: 280 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          导出 CSV
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>导出当前筛选结果</PopoverTitle>
          <PopoverDescription>
            按现在的筛选条件导出 137 条记录，显示列即导出列。
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)

/**
 * It wraps, and it is meant to: two or three lines of explanation is the size
 * this panel is for. More than that and the thing you wanted was a dialog or a
 * page, not a popover.
 */
export const TwoLines = () => (
  <div style={{ minHeight: 300 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          资产编号 ⓘ
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>资产编号怎么来的</PopoverTitle>
          <PopoverDescription>
            录入时若不填，系统按类别前缀自动生成，例如网络设备是 NX-。
            编号一旦写入就不再变动，打印在标签上的也是这一串。
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)
