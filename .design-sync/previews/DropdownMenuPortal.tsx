import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * Where the portal is actually needed: around a `DropdownMenuSubContent`.
 *
 * `DropdownMenuContent` already portals itself -- writing one around the top
 * level menu is a no-op. A submenu's panel does not: without a portal it stays
 * inside the parent menu's DOM, and any ancestor with `overflow: hidden` or a
 * transform (a table frame, a scrolled card) clips it. The portal lifts it to
 * the document, where its own positioning can put it anywhere on screen.
 */
export const AroundSubContent = () => (
  <div className="flex w-full items-start" style={{ minHeight: 288 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          已选 12 台
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onOpenAutoFocus={(e) => e.preventDefault()} align="start" className="w-56">
        <DropdownMenuLabel>批量操作</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>批量签出</DropdownMenuItem>
        <DropdownMenuSub defaultOpen>
          <DropdownMenuSubTrigger>状态改为</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuItem>在库</DropdownMenuItem>
              <DropdownMenuItem>已签出</DropdownMenuItem>
              <DropdownMenuItem>维修中</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">已报废</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * Inside a clipping ancestor -- the table frame the asset list lives in --
 * which is the case the portal exists for. The flyout leaves the rounded,
 * overflow-hidden frame instead of being cut off at its edge.
 */
export const EscapingAClippedFrame = () => (
  <div className="w-full" style={{ minHeight: 320 }}>
    <div className="w-72 overflow-hidden rounded-xl border p-3">
      <p className="mb-2 text-sm text-muted-foreground">上海仓库 · 网络设备</p>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            已选 12 台
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onOpenAutoFocus={(e) => e.preventDefault()} align="start" className="w-48">
          <DropdownMenuItem>批量签出</DropdownMenuItem>
          <DropdownMenuSub defaultOpen>
            <DropdownMenuSubTrigger>转移到</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-40">
                <DropdownMenuItem>上海仓库</DropdownMenuItem>
                <DropdownMenuItem>北京仓库</DropdownMenuItem>
                <DropdownMenuItem>深圳仓库</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem>导出 CSV</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
)
