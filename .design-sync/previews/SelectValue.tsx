import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

const CATEGORIES = (
  <SelectContent>
    <SelectGroup>
      <SelectItem value="net">网络设备</SelectItem>
      <SelectItem value="srv">服务器</SelectItem>
      <SelectItem value="nb">笔记本</SelectItem>
    </SelectGroup>
  </SelectContent>
)

/**
 * What the closed trigger reads. It echoes the chosen item's own text, so the
 * label lives in exactly one place -- never pass it a child of your own.
 */
export const ShowsTheChoice = () => (
  <Select defaultValue="net">
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    {CATEGORIES}
  </Select>
)

/**
 * With nothing chosen it falls back to `placeholder`, which the trigger paints
 * in the muted colour. A filter with an 「全部…」 sentinel row does not need one:
 * something is always chosen there.
 */
export const Placeholder = () => (
  <Select>
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue placeholder="选择类别" />
    </SelectTrigger>
    {CATEGORIES}
  </Select>
)
