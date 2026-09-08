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
 * The flyout panel of a submenu. It is its own surface -- same border, radius
 * and popover ground as the parent, one shadow step deeper -- and it positions
 * itself beside the row that opened it, flipping to the other side when there
 * is no room. Its width is set here, not inherited from the parent menu.
 */
export const StatusBranch = () => (
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
          <DropdownMenuSubContent className="w-44">
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
 * The flyout takes the same parts the parent does -- a label, rules, groups --
 * so a branch that needs sections gets them without a second component.
 */
export const LabelledBranch = () => (
  <div className="flex w-full items-start" style={{ minHeight: 288 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          已选 12 台
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onOpenAutoFocus={(e) => e.preventDefault()} align="start" className="w-56">
        <DropdownMenuItem>批量签出</DropdownMenuItem>
        <DropdownMenuSub defaultOpen>
          <DropdownMenuSubTrigger>转移到</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>库房</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>上海仓库</DropdownMenuItem>
            <DropdownMenuItem>北京仓库</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>人员</DropdownMenuLabel>
            <DropdownMenuItem>陈立</DropdownMenuItem>
            <DropdownMenuItem>周敏</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
