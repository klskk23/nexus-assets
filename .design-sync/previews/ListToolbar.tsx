import { Button, ListToolbar, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "nexus-assets-web"

/**
 * Search, filters and actions in one lane above a table.
 *
 * The filter row is ONE lane: controls sit side by side with their labels
 * screen-reader-only, and "全部 X" is the control's own empty value rather than
 * a line of text stacked above it. Filter values are named for the API keys
 * they become, so one object feeds both the request and the address bar.
 */
const CategoryFilter = () => (
  <Select defaultValue="all">
    <SelectTrigger size="sm" className="w-36" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">全部类别</SelectItem>
      <SelectItem value="net">网络设备</SelectItem>
      <SelectItem value="srv">服务器</SelectItem>
    </SelectContent>
  </Select>
)

export const WithFilters = () => (
  <ListToolbar
    q=""
    onQ={() => {}}
    searchHint="搜索资产"
    filters={<CategoryFilter />}
    actions={<Button size="sm">录入设备</Button>}
  />
)

/** Searching: the term stays in the box and in the address bar. */
export const Searching = () => (
  <ListToolbar q="2199023" onQ={() => {}} searchHint="搜索资产" filters={<CategoryFilter />} />
)

/** A page with nothing to filter by still gets the search lane. */
export const SearchOnly = () => <ListToolbar q="" onQ={() => {}} searchHint="搜索名称、编号" />
