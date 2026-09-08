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
 * The sub-trigger is a menu row that opens another menu instead of doing
 * something. It draws its own chevron on the right -- do not add one -- and
 * highlights while its branch is open, which is what tells a reader which of
 * the rows the flyout belongs to.
 */
export const Open = () => (
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
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * Two branches at rest, which is what most of a menu's life looks like: a row
 * with a chevron, costing nothing until it is pointed at.
 *
 * Do not reach for `disabled` here. The prop passes through, but this
 * component carries no disabled styling -- a disabled sub-trigger looks
 * exactly like an enabled one and still reads as available. Leave the branch
 * out, or use a plain `DropdownMenuItem disabled`, which does grey out.
 */
export const Resting = () => (
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>转移到</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuItem>上海仓库</DropdownMenuItem>
            <DropdownMenuItem>北京仓库</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * `inset` on the sub-trigger, for a menu whose other rows carry ticks: the
 * branch keeps the same left gutter, so the flyout row does not sit half a
 * character left of everything above it.
 */
export const Inset = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          视图
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onOpenAutoFocus={(e) => e.preventDefault()} align="start" className="w-56">
        <DropdownMenuItem inset>重置为默认列</DropdownMenuItem>
        <DropdownMenuSub defaultOpen>
          <DropdownMenuSubTrigger inset>每页条数</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-36">
            <DropdownMenuItem>20 条</DropdownMenuItem>
            <DropdownMenuItem>50 条</DropdownMenuItem>
            <DropdownMenuItem>100 条</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
