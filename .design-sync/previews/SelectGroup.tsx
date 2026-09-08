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
 * The open list is item-aligned by default -- it covers the trigger, with the
 * chosen row where the trigger was. So a group heading above that row needs
 * room above the control, or it is the part that scrolls out of frame.
 */
const room: React.CSSProperties = { paddingTop: 72 }

/**
 * Rows that belong together, tied to their `SelectLabel` for a screen reader.
 * The field-type picker is the product's own example: one enum in the database,
 * split here into the difference a person actually cares about -- is this value
 * typed in, or worked out?
 */
export const TwoKindsOfFieldType = () => (
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
          <SelectItem value="boolean">布尔</SelectItem>
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
 * A single unlabelled group is the ordinary case -- it still exists, because it
 * is what gives the list its one `role="group"` instead of loose rows.
 */
export const OneGroupNoLabel = () => (
  <Select defaultValue="50" defaultOpen>
    <SelectTrigger className="w-32" aria-label="每页">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="20">20 条</SelectItem>
        <SelectItem value="50">50 条</SelectItem>
        <SelectItem value="100">100 条</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)
