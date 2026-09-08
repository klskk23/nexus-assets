import {
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * This product never writes a native `<select>`. Every dropdown is this
 * component, so the pill trigger, the keyboard behaviour and the checkmark are
 * the same everywhere.
 *
 * `SelectItem` may not carry the empty string -- Radix reserves it for "nothing
 * chosen". The 「全部类别」 row therefore holds the sentinel from
 * `web/src/lib/select.ts`, and the call site converts at the boundary with
 * `toNone` / `fromNone`.
 */
const NONE = "__none" // lib/select.ts

export const CategoryFilter = () => (
  <Select defaultValue={NONE} defaultOpen>
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value={NONE}>全部类别</SelectItem>
        <SelectItem value="net">网络设备</SelectItem>
        <SelectItem value="srv">服务器</SelectItem>
        <SelectItem value="nb">笔记本</SelectItem>
        <SelectItem value="mon">显示器</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)

/**
 * Inside a `Field` the trigger stretches, so the width goes on the field.
 * Statuses are the product's five built-in keys -- the label is what a person
 * picks, the key is what crosses the wire.
 */
export const StatusInAField = () => (
  <Field className="w-56">
    <FieldLabel htmlFor="sel-status">状态</FieldLabel>
    <Select defaultValue="in_stock" defaultOpen>
      <SelectTrigger id="sel-status">
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
  </Field>
)
