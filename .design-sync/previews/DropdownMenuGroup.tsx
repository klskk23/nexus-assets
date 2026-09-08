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
 * The column picker's two groups. A group is not a visual box -- the rule and
 * the label draw the section -- it is the grouping a screen reader announces,
 * which is how 基准 MAC is heard as one of 字段列 rather than as the seventh
 * item of a flat list of nine.
 */
export const ColumnGroups = () => (
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
 * Groups around plain items too: what happens to the selected rows, then what
 * leaves the system. The rule between them is the visible seam; the group is
 * what makes it mean something.
 */
export const ActionGroups = () => (
  <div className="flex w-full items-start" style={{ minHeight: 320 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          已选 12 台
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem>批量签出</DropdownMenuItem>
          <DropdownMenuItem>批量归还</DropdownMenuItem>
          <DropdownMenuItem>转移到上海仓库</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>导出 CSV</DropdownMenuItem>
          <DropdownMenuItem>打印标签</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
