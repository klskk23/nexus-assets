import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * The shortcut is the right-hand half of an item: it pushes itself to the far
 * edge on its own (`ml-auto`), so the labels stay left-aligned however long
 * the keys are. It is a label, not a binding -- the key still has to be wired
 * up wherever the page listens.
 */
export const WithShortcuts = () => (
  <div className="flex w-full items-start" style={{ minHeight: 288 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          已选 12 台
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>批量操作</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          批量签出
          <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          导出 CSV
          <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          打印标签
          <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          标记为已报废
          <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * A shortcut carries any trailing hint, not only a key: here it is the count
 * of devices each action would touch. Same slot, same muted weight, so the
 * numbers form a column instead of trailing the labels at ragged widths.
 */
export const TrailingCount = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          按状态筛选
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem>
          在库
          <DropdownMenuShortcut>41</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          已签出
          <DropdownMenuShortcut>17</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          维修中
          <DropdownMenuShortcut>4</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
