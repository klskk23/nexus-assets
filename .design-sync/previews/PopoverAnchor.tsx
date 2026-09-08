import {
  Button,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "nexus-assets-web"

/**
 * PopoverAnchor splits "what you click" from "what the panel hangs off".
 * Without it the panel is positioned against the trigger; with it the trigger
 * can be a small button at the end of a row while the panel lines up with the
 * row itself.
 *
 * `asChild` again -- the anchor should not add an element of its own to the
 * layout it is measuring.
 */
export const AnchoredToTheRow = () => (
  <div style={{ minHeight: 280 }}>
    <Popover defaultOpen>
      <PopoverAnchor asChild>
        <div
          className="flex items-center justify-between gap-2 rounded-md border p-2"
          style={{ width: "22rem" }}
        >
          <span className="text-sm">NX-2417 · 上海仓库</span>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              持有方
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6}>
        <PopoverHeader>
          <PopoverTitle>当前持有方</PopoverTitle>
          <PopoverDescription>陈立 · 网络运维组 · 已签出 12 天</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)

/**
 * An anchor with no trigger inside it at all: the popover's open state is
 * driven by the page (a row that just changed state), and the panel is placed
 * against the cell it is talking about. This is the only way to attach a panel
 * to something nobody clicked.
 */
export const NoTriggerAtAll = () => (
  <div style={{ minHeight: 240 }}>
    <Popover open>
      <PopoverAnchor asChild>
        <span className="text-sm font-mono tabular-nums">NX-2417</span>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6}>
        <PopoverHeader>
          <PopoverTitle>已改为维修中</PopoverTitle>
          <PopoverDescription>流转已记录，负责人保持不变。</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  </div>
)
