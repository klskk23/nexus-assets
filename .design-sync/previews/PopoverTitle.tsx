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
 * The one line naming what the panel is about. It is a medium weight at the
 * panel's own text size -- not a heading, and not something to grow with a
 * `text-lg` of your own: a popover is not a dialog, and a title that looks
 * like a dialog's makes people expect one.
 *
 * Keep it to a noun phrase. The sentence goes in PopoverDescription.
 */
export const NamingThePanel = () => (
  <div style={{ minHeight: 260 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          网络设备
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>网络设备</PopoverTitle>
          <PopoverDescription>
            含 3 个子类别，共 62 台；已报废的不计入。
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)

/**
 * A title on its own is fine when the panel's body says the rest. What is not
 * fine is a panel whose first line is body text -- the reader has nothing to
 * tell them which control they just opened.
 */
export const TitleOnly = () => (
  <div style={{ minHeight: 280 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          最近流转
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>最近流转</PopoverTitle>
        </PopoverHeader>
        <div
          className="flex flex-col gap-2 text-sm text-muted-foreground"
          style={{ marginTop: "0.75rem" }}
        >
          <span>NX-2417 已签出 · 陈立</span>
          <span>NX-2390 已归还 · 上海仓库</span>
          <span>NX-1188 维修中 · 送修中心</span>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)
