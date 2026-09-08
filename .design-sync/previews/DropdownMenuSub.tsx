import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * A submenu is three parts that must nest: `DropdownMenuSub` wraps a
 * `DropdownMenuSubTrigger` (the row that stays in the parent list) and a
 * `DropdownMenuSubContent` (the panel that flies out beside it). The Sub
 * carries the open state, so `defaultOpen` goes there and not on the trigger.
 *
 * 状态改为 is the natural branch: five statuses would be five rows in a menu
 * that already has five, and a device is only ever set to one of them.
 */
export const StatusSubmenu = () => (
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
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuItem>在库</DropdownMenuItem>
            <DropdownMenuItem>已签出</DropdownMenuItem>
            <DropdownMenuItem>维修中</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">已报废</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * Two submenus in one menu, only one of them open -- the resting state, where
 * a branch reads as a row with a chevron and costs nothing until it is
 * pointed at.
 */
export const TwoBranches = () => (
  <div className="flex w-full items-start" style={{ minHeight: 288 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          已选 12 台
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onOpenAutoFocus={(e) => e.preventDefault()} align="start" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>状态改为</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuItem>在库</DropdownMenuItem>
            <DropdownMenuItem>维修中</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub defaultOpen>
          <DropdownMenuSubTrigger>转移到</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuItem>上海仓库</DropdownMenuItem>
            <DropdownMenuItem>北京仓库</DropdownMenuItem>
            <DropdownMenuItem>深圳仓库</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
