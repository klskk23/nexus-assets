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
 * Two labels naming the two halves of the column picker: the built-in columns
 * every device has, then the category's own fields. A label is not selectable
 * and not focusable -- it titles the group under it, which is why the ticks
 * below 字段列 read as belonging to 网络设备 and not to everything.
 */
export const ColumnPickerSections = () => (
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
              状态
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={false} onSelect={(e) => e.preventDefault()}>
              负责人
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

/**
 * A label naming whose session this is, above the account menu's items. It
 * takes the same left padding the items do, so the title lines up with the
 * things it titles rather than hanging left of them; `inset` shifts it into
 * the wider gutter instead, for a menu whose items carry ticks.
 */
export const AccountHeading = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          陈立
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>陈立 · 资产管理员</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>设置</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
