import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * One radio group holds the page size: the choices are exclusive, so exactly
 * one dot is filled and picking another moves it. This is the difference from
 * the column picker next door -- that one is checkboxes because a table can
 * show 资产编号 and 状态 at the same time; a page shows 50 rows or 100, never
 * both.
 *
 * The `value` lives on the group, not on the items.
 */
export const PageSize = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          每页 50 条
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>每页条数</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="50">
          <DropdownMenuRadioItem value="20">20 条</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="50">50 条</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="100">100 条</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * Two groups in one menu, each with its own exclusive answer: what the table
 * is sorted by, and which direction. Separate groups are what keep 资产编号
 * and 升序 from cancelling each other out.
 */
export const SortOrder = () => (
  <div className="flex w-full items-start" style={{ minHeight: 320 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          排序
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>排序字段</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="asset_no">
          <DropdownMenuRadioItem value="asset_no">资产编号</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="updated_at">最近变更</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="holder">持有方</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>方向</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="desc">
          <DropdownMenuRadioItem value="asc">升序</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc">降序</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
