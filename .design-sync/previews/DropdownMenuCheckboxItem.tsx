import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * The column picker -- this product's one use of checkbox items, and the
 * composition worth copying whole.
 *
 * Two things are load-bearing. `modal={false}` on the root keeps the table
 * behind the menu alive. `onSelect={(e) => e.preventDefault()}` on every item
 * keeps the menu open after a tick: choosing columns is a handful of decisions
 * in a row, and closing after each one makes it four trips.
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
              负责人
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

/**
 * The three states side by side: ticked, empty, and disabled. A field that
 * cannot become a column stays listed and greyed rather than disappearing, so
 * the list does not change length between categories.
 */
export const States = () => (
  <div className="flex w-full items-start" style={{ minHeight: 288 }}>
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          字段列
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuCheckboxItem checked onSelect={(e) => e.preventDefault()}>
          基准 MAC
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={false} onSelect={(e) => e.preventDefault()}>
          固件版本
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={false} disabled>
          保修截止日
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
