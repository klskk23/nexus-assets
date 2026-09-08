import {
  FieldLabel,
  Hint,
  ToggleGroup,
  ToggleGroupItem,
} from "nexus-assets-web"

/**
 * A short, fixed set of modes shown all at once, in a single pill. Always
 * `variant="outline"` in this product, and `className="justify-start"` so it
 * sits at the left edge of a form column instead of stretching.
 *
 * The transfer dialog's first question. Five acts, mutually exclusive, and
 * which one is chosen changes the rest of the form -- so they are on screen
 * together rather than behind a Select nobody opens.
 */
export const TransferAction = () => (
  <div className="grid gap-2">
    <FieldLabel htmlFor="tg-action">操作</FieldLabel>
    <ToggleGroup
      id="tg-action"
      type="single"
      variant="outline"
      className="justify-start"
      defaultValue="checkout"
    >
      <ToggleGroupItem value="checkout">签出</ToggleGroupItem>
      <ToggleGroupItem value="checkin">归还</ToggleGroupItem>
      <ToggleGroupItem value="transfer">转移</ToggleGroupItem>
      <ToggleGroupItem value="reassign">改负责人</ToggleGroupItem>
      <ToggleGroupItem value="status">改状态</ToggleGroupItem>
    </ToggleGroup>
  </div>
)

/**
 * Two sides of one decision: a field binds to categories or to devices, never
 * to both. `type="single"` is what says that -- with checkboxes the form would
 * have to explain afterwards why the combination was refused.
 */
export const BindingMode = () => (
  <div className="grid gap-2">
    <div className="flex items-center gap-1.5">
      <FieldLabel htmlFor="tg-bind">绑定到</FieldLabel>
      <Hint>只能选一种；绑型号的字段只出现在这些型号的设备上。</Hint>
    </div>
    <ToggleGroup
      id="tg-bind"
      type="single"
      variant="outline"
      className="justify-start"
      defaultValue="category"
    >
      <ToggleGroupItem value="category">类别</ToggleGroupItem>
      <ToggleGroupItem value="device">设备</ToggleGroupItem>
    </ToggleGroup>
  </div>
)

/**
 * Frozen once something depends on it: a field that is already bound one way
 * cannot switch sides, and the whole group goes dead with the way out written
 * under it. The state of the thing in front of you, not a hint to go looking
 * for.
 */
export const Frozen = () => (
  <div className="grid gap-2">
    <FieldLabel htmlFor="tg-frozen">绑定到</FieldLabel>
    <ToggleGroup
      id="tg-frozen"
      type="single"
      variant="outline"
      className="justify-start"
      defaultValue="device"
      disabled
    >
      <ToggleGroupItem value="category">类别</ToggleGroupItem>
      <ToggleGroupItem value="device">设备</ToggleGroupItem>
    </ToggleGroup>
    <p className="text-muted-foreground text-xs">要换先解除现有的全部绑定。</p>
  </div>
)
