import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * The open list. It renders through a Portal and, in the default
 * `position="item-aligned"`, lays itself over the trigger with the chosen row
 * where the trigger was -- which is why a preview of it has to be `defaultOpen`.
 */
export const Open = () => (
  <Select defaultValue="in_stock" defaultOpen>
    <SelectTrigger className="w-48" aria-label="状态">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="in_stock">在库</SelectItem>
        <SelectItem value="checked_out">已签出</SelectItem>
        <SelectItem value="repairing">维修中</SelectItem>
        <SelectItem value="lost">丢失</SelectItem>
        <SelectItem value="retired">已报废</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)

/**
 * `position="popper"` drops the list below the trigger instead of over it, and
 * matches its width. Use it when the trigger must stay readable while the list
 * is open -- a filter bar, where the trigger says which filter this is.
 */
export const Popper = () => (
  <Select defaultValue="text" defaultOpen>
    <SelectTrigger className="w-48" aria-label="字段类型">
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper">
      <SelectGroup>
        <SelectLabel>录入</SelectLabel>
        <SelectItem value="text">文本</SelectItem>
        <SelectItem value="number">数字</SelectItem>
        <SelectItem value="date">日期</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>计算</SelectLabel>
        <SelectItem value="computed">计算项</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)
