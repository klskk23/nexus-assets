import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * `align="start"` with a fixed width: the account menu in the navigation rail.
 * The width is set on the content, not on the items, so 设置 and 退出登录 line
 * up under a trigger that is narrower than either of them.
 */
export const AlignStart = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          陈立
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem>设置</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * `align="end"` is what a menu hanging off the right end of a toolbar needs:
 * the content's right edge meets the trigger's, so a menu wider than its
 * button grows inward instead of off the page.
 */
export const AlignEnd = () => (
  <div className="w-full" style={{ minHeight: 320 }}>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">上海仓库 · 在库 41 台</span>
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="显示列">
            ⋮
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>显示列</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked onSelect={(e) => e.preventDefault()}>
            资产编号
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked onSelect={(e) => e.preventDefault()}>
            类别
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked onSelect={(e) => e.preventDefault()}>
            状态
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false} onSelect={(e) => e.preventDefault()}>
            负责人
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
)

/**
 * `side="right"` with an offset -- the shape a menu takes when its trigger
 * sits in a left-hand rail and there is nothing below it to open into.
 */
export const SideRight = () => (
  <div className="flex w-full items-start" style={{ minHeight: 224 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          批量操作
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-44">
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
        <DropdownMenuItem>打印标签</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">标记为已报废</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
