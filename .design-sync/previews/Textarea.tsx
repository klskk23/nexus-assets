import { Label, Textarea } from "nexus-assets-web"

/**
 * Deliberately NOT a pill, though every other control in this family is: a
 * textarea is two or more lines tall and a 999px corner cuts into the first and
 * the last. It takes the mid radius, which is where a multi-line box belongs.
 */
export const DeviceNote = () => (
  <div className="grid gap-2" style={{ maxWidth: "28rem" }}>
    <Label htmlFor="p-note">备注</Label>
    <Textarea
      id="p-note"
      defaultValue="屏幕左下角有划痕，2026 年 8 月入库时已存在。"
      rows={3}
    />
  </div>
)

/** The movement note and the device note are different things: one belongs to
 *  this handover, the other outlives it. */
export const TransferNote = () => (
  <div className="grid gap-2" style={{ maxWidth: "28rem" }}>
    <Label htmlFor="p-tnote">本次流转备注</Label>
    <Textarea id="p-tnote" placeholder="这一次为什么移动。设备自己的备注在下面，且会一直留着。" rows={2} />
  </div>
)

export const Disabled = () => <Textarea style={{ maxWidth: "28rem" }} defaultValue="只读的历史记录" disabled rows={2} />
