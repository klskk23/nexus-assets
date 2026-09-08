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

const ITEMS = (
  <SelectContent>
    <SelectGroup>
      <SelectItem value="in_stock">在库</SelectItem>
      <SelectItem value="checked_out">已签出</SelectItem>
      <SelectItem value="repairing">维修中</SelectItem>
    </SelectGroup>
  </SelectContent>
)

/**
 * The closed control: a pill, `w-fit` by default, with the chevron built in.
 * `size="sm"` is the toolbar height -- it lines up with a `size="sm"` Button in
 * a `ListToolbar`; the default is the form height.
 */
export const Sizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
      <span className="text-xs text-muted-foreground">default — 表单</span>
      <Select defaultValue="in_stock">
        <SelectTrigger aria-label="状态">
          <SelectValue />
        </SelectTrigger>
        {ITEMS}
      </Select>
    </div>
    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
      <span className="text-xs text-muted-foreground">sm — 工具栏</span>
      <Select defaultValue="in_stock">
        <SelectTrigger size="sm" aria-label="状态">
          <SelectValue />
        </SelectTrigger>
        {ITEMS}
      </Select>
    </div>
  </div>
)

/**
 * Width belongs on the `Field` around it, not here: `Field` stretches its
 * children, so one class sizes the label, the trigger and any message under it
 * together. `w-fit` on the trigger is only for a bare filter with no field.
 */
export const WidthComesFromTheField = () => (
  <Field className="w-56">
    <FieldLabel htmlFor="st-status">状态</FieldLabel>
    <Select defaultValue="repairing">
      <SelectTrigger id="st-status">
        <SelectValue />
      </SelectTrigger>
      {ITEMS}
    </Select>
  </Field>
)

/** Frozen, and invalid. Both states are on the trigger, not on the field. */
export const DisabledAndInvalid = () => (
  <div className="flex items-center gap-3">
    <Select defaultValue="in_stock" disabled>
      <SelectTrigger aria-label="状态">
        <SelectValue />
      </SelectTrigger>
      {ITEMS}
    </Select>
    <Select>
      <SelectTrigger aria-invalid aria-label="状态">
        <SelectValue placeholder="选择状态" />
      </SelectTrigger>
      {ITEMS}
    </Select>
  </div>
)
