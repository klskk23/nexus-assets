import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * The account menu at the foot of the navigation rail -- the whole of this
 * product's first use of a dropdown. Two items and a rule: 设置, then 退出登录
 * as the destructive one below the separator.
 */
export const AccountMenu = () => (
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
 * The column picker on the asset table's filter row. `modal={false}` is the
 * load-bearing prop: the menu stands over a live table, and the rows behind it
 * stay scrollable and clickable while columns are being ticked.
 */
export const ColumnPicker = () => (
  <div className="w-full" style={{ minHeight: 384 }}>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">网络设备 · 62 台</span>
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="显示列">
            ⋮
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>显示列</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
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
              持有方
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={false} onSelect={(e) => e.preventDefault()}>
              备注
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>字段列</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuCheckboxItem checked onSelect={(e) => e.preventDefault()}>
              基准 MAC
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={false} onSelect={(e) => e.preventDefault()}>
              固件版本
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
)
