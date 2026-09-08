import { FieldLabel, ToggleGroup, ToggleGroupItem } from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so a card without this reads its `bg-card` and `bg-muted` parts as
   pale chips instead of as surfaces on a page. */
const ground = { background: "var(--background)", padding: "1rem" } as const
/**
 * One segment. With the group's default `spacing={0}` the items lose their
 * inner corners and share borders, so the run reads as a single pill -- the
 * first item keeps the left round end, the last keeps the right one. That is
 * done by the item, not by the group, which is why an item is never used
 * outside one.
 */
export const OneChosen = () => (
  <div style={ground}>
    <div className="grid gap-2">
      <FieldLabel htmlFor="tgi-action">操作</FieldLabel>
      <ToggleGroup
        id="tgi-action"
        type="single"
        variant="outline"
        className="justify-start"
        defaultValue="transfer"
      >
        <ToggleGroupItem value="checkout">签出</ToggleGroupItem>
        <ToggleGroupItem value="checkin">归还</ToggleGroupItem>
        <ToggleGroupItem value="transfer">转移</ToggleGroupItem>
        <ToggleGroupItem value="reassign">改负责人</ToggleGroupItem>
        <ToggleGroupItem value="status">改状态</ToggleGroupItem>
      </ToggleGroup>
    </div>
  </div>
)

/**
 * `type="multiple"` and several items pressed: which columns the asset table
 * shows. Not one answer but a subset, and the same segments say so simply by
 * being lit together.
 */
export const SeveralPressed = () => (
  <div style={ground}>
    <div className="grid gap-2">
      <FieldLabel htmlFor="tgi-cols">显示列</FieldLabel>
      <ToggleGroup
        id="tgi-cols"
        type="multiple"
        variant="outline"
        className="justify-start"
        defaultValue={["sn", "status", "holder"]}
      >
        <ToggleGroupItem value="sn">编号</ToggleGroupItem>
        <ToggleGroupItem value="category">类别</ToggleGroupItem>
        <ToggleGroupItem value="status">状态</ToggleGroupItem>
        <ToggleGroupItem value="holder">持有方</ToggleGroupItem>
        <ToggleGroupItem value="owner">负责人</ToggleGroupItem>
      </ToggleGroup>
    </div>
  </div>
)

/**
 * A single segment can be dead while the rest stay live -- 归还 means nothing
 * for a device that is already 在库. The reason rides on `title`, and the
 * segment stays in place so the set of acts is the same set every time.
 */
export const OneDisabled = () => (
  <div style={ground}>
    <div className="grid gap-2">
      <FieldLabel htmlFor="tgi-partial">操作</FieldLabel>
      <ToggleGroup
        id="tgi-partial"
        type="single"
        variant="outline"
        className="justify-start"
        defaultValue="checkout"
      >
        <ToggleGroupItem value="checkout">签出</ToggleGroupItem>
        <ToggleGroupItem value="checkin" disabled title="这台设备现在就在库">
          归还
        </ToggleGroupItem>
        <ToggleGroupItem value="transfer">转移</ToggleGroupItem>
        <ToggleGroupItem value="reassign">改负责人</ToggleGroupItem>
        <ToggleGroupItem value="status">改状态</ToggleGroupItem>
      </ToggleGroup>
    </div>
  </div>
)
