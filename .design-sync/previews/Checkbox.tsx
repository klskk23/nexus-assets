import {
  Checkbox,
  Field,
  FieldLabel,
  Hint,
} from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so a card without this reads its `bg-card` and `bg-muted` parts as
   pale chips instead of as surfaces on a page. */
const ground = { background: "var(--background)", padding: "1rem" } as const
/**
 * A flag with one line to itself. Always paired with a `FieldLabel htmlFor`
 * inside a `Field orientation="horizontal"` -- the 16px box is not a click
 * target anyone should have to aim at, and an unlabelled box is a control a
 * screen reader cannot name.
 *
 * This is the asset list's category filter modifier: it only appears once a
 * category has been chosen, because "含子类别" means nothing without one.
 */
export const IncludeDescendants = () => (
  <div style={ground}>
    <div className="flex items-center gap-2">
      <Field orientation="horizontal" className="w-auto">
        <Checkbox id="cb-descendants" defaultChecked />
        <FieldLabel htmlFor="cb-descendants">含子类别</FieldLabel>
      </Field>
      {/* Outside the Field: a horizontal Field spreads its children across the
          row, which would push the mark to the far end of the toolbar. */}
      <Hint>勾上时「网络设备」也会带出交换机、路由器下面的设备。</Hint>
    </div>
  </div>
)

/**
 * The two flags a field carries, side by side because they are read together:
 * does this value have to be there, and does it have to be unlike every other.
 *
 * 唯一 is fixed after creation -- disabled rather than removed, with the Hint
 * switching from what it means to why it is dead.
 */
export const TheTwoFieldFlags = () => (
  <div style={ground}>
    <div className="grid gap-3 sm:grid-cols-2" style={{ maxWidth: 560 }}>
      <div className="flex items-center gap-2">
        <Checkbox id="cb-unique" defaultChecked disabled />
        <FieldLabel htmlFor="cb-unique">唯一</FieldLabel>
        <Hint>建好后不能改。</Hint>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="cb-required" defaultChecked />
        <FieldLabel htmlFor="cb-required">必填</FieldLabel>
        <Hint>所有绑定都要求填；存量设备下次编辑时才补。</Hint>
      </div>
    </div>
  </div>
)

/**
 * `checked="indeterminate"` is the header box over a table where some of the
 * page is ticked. Not a third thing anybody can choose -- pressing it ticks
 * the rest -- but the only honest picture of "part of this".
 */
export const AllStates = () => (
  <div style={ground}>
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="cb-all" checked={false} />
        <FieldLabel htmlFor="cb-all">全选本页</FieldLabel>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="cb-some" checked="indeterminate" />
        <FieldLabel htmlFor="cb-some">本页 12 条已选中</FieldLabel>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="cb-every" checked />
        <FieldLabel htmlFor="cb-every">符合当前筛选的 137 条已全部选中</FieldLabel>
      </div>
    </div>
  </div>
)

/**
 * Picking which categories a field binds to: a list of boxes, and the reason a
 * box cannot be ticked written where the box is, not somewhere to go looking
 * for.
 */
export const InABindingList = () => (
  <div style={ground}>
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="cb-bind-net" defaultChecked />
        <FieldLabel htmlFor="cb-bind-net">网络设备</FieldLabel>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="cb-bind-sw" disabled />
        <FieldLabel htmlFor="cb-bind-sw" className="text-muted-foreground">
          交换机
        </FieldLabel>
        <span className="text-muted-foreground text-xs">
          已从上级「网络设备」继承，同一条链上不必也不能再绑一次
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="cb-bind-lap" />
        <FieldLabel htmlFor="cb-bind-lap">笔记本电脑</FieldLabel>
      </div>
    </div>
  </div>
)
