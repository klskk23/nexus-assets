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
 * One rule, doing the only job a rule has here: putting distance between 设置
 * and the destructive 退出登录 so the second is never hit while reaching for
 * the first.
 */
export const BeforeDestructive = () => (
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
 * Two rules in the column picker: one under the menu's own title, one between
 * the built-in columns and the category's fields. The rule is what tells a
 * reader that 基准 MAC belongs to 网络设备 and 状态 belongs to every device.
 */
export const BetweenSections = () => (
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
