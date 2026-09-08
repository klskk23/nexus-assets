import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/** The sentinel from `web/src/lib/select.ts`. */
const NONE = "__none"

/**
 * One row of the list, and the rule that catches everyone: **`value` may not be
 * the empty string.** Radix keeps `""` for "nothing chosen", so an 「全部…」 or
 * 「无」 row carries the `NONE` sentinel instead, and the call site converts with
 * `toNone` / `fromNone` on the way in and out.
 */
export const TheAllRowIsASentinel = () => (
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
      </SelectGroup>
    </SelectContent>
  </Select>
)

/**
 * A row that exists but cannot be picked. Here 「已报废」 is a terminal status:
 * it stays visible so the reader knows it is a real state, faded so they know
 * this device cannot be moved into it from where it is.
 */
export const Disabled = () => (
  <Select defaultValue="repairing" defaultOpen>
    <SelectTrigger className="w-48" aria-label="状态">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="in_stock">在库</SelectItem>
        <SelectItem value="checked_out">已签出</SelectItem>
        <SelectItem value="repairing">维修中</SelectItem>
        <SelectItem value="retired" disabled>
          已报废
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)
