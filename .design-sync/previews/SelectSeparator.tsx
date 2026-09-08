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

/** The sentinel from `web/src/lib/select.ts`. */
const NONE = "__none"

/**
 * A hairline between two `SelectGroup`s. It is `pointer-events-none`, so it can
 * never swallow a click meant for the row above or below it.
 *
 * The space above the trigger is scaffolding: an item-aligned list covers its
 * trigger, so the first group's heading needs somewhere to go.
 */
export const BetweenTwoGroups = () => (
  <div style={{ paddingTop: 72 }}>
    <Select defaultValue="text" defaultOpen>
      <SelectTrigger className="w-48" aria-label="字段类型">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>录入</SelectLabel>
          <SelectItem value="text">文本</SelectItem>
          <SelectItem value="number">数字</SelectItem>
          <SelectItem value="ip">IP 地址</SelectItem>
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
 * The other use: cutting the 「全部…」 sentinel row away from the real values, so
 * the escape hatch does not read as one more category.
 */
export const AfterTheAllRow = () => (
  <Select defaultValue={NONE} defaultOpen>
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value={NONE}>全部类别</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectItem value="net">网络设备</SelectItem>
        <SelectItem value="srv">服务器</SelectItem>
        <SelectItem value="nb">笔记本</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)
