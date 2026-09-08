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
 * `asChild` is how every trigger in this product is written: the Button is the
 * trigger, so it keeps the pill shape and the ghost variant instead of getting
 * a bare <button> wrapped around it.
 */
export const NamedTrigger = () => (
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
 * The other trigger this product uses: an icon button on the table bar. The
 * glyph carries no name, so the trigger takes an `aria-label` -- without one
 * the menu is unreachable by name.
 */
export const IconTrigger = () => (
  <div className="w-full" style={{ minHeight: 288 }}>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">共 62 台设备</span>
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
            状态
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false} onSelect={(e) => e.preventDefault()}>
            持有方
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
)

/** A trigger whose menu is closed -- the resting state on the page. */
export const Closed = () => (
  <div className="flex w-full items-start">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          批量操作
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem>导出 CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
