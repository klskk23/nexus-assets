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
 * `SelectContent` is item-aligned by default: it lays the open list over the
 * trigger with the chosen row where the trigger was, so anything *above* that
 * row needs room above the control. These cells leave it -- without the space,
 * the first group's heading is the part that scrolls out of frame.
 */
const room: React.CSSProperties = { paddingTop: 72 }

/**
 * The heading of a `SelectGroup` -- small, muted, and not pickable. It names
 * what the rows under it have in common; it never repeats the trigger's own
 * label, which the field beside the control already says.
 */
export const GroupHeadings = () => (
  <div style={room}>
    <Select defaultValue="text" defaultOpen>
      <SelectTrigger className="w-48" aria-label="字段类型">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
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
  </div>
)

/**
 * Headings earn their keep when the list is long enough that a reader scans
 * rather than reads -- holders sorted into the two kinds this product has.
 */
export const SortingALongList = () => (
  <div style={room}>
    <Select defaultValue="wh-sh" defaultOpen>
      <SelectTrigger className="w-56" aria-label="持有方">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>仓库</SelectLabel>
          <SelectItem value="wh-sh">上海仓库</SelectItem>
          <SelectItem value="wh-bj">北京仓库</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>部门</SelectLabel>
          <SelectItem value="dept-it">信息技术部</SelectItem>
          <SelectItem value="dept-fin">财务部</SelectItem>
          <SelectItem value="dept-ops">运维组</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
)
