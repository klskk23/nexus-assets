import {
  Badge,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Hint,
  Input,
} from "nexus-assets-web"

/**
 * `FieldLabel` is `Label` with the field's disabled fade wired in, and it is
 * `w-fit` -- so the badges and the question mark that belong *to the label* go
 * in a flex row beside it rather than inside it.
 */
export const WithHintAndBadges = () => (
  <Field>
    <div className="flex items-center gap-2">
      <FieldLabel htmlFor="fl-rack">
        机架位置
        <span className="ml-1 text-destructive">*</span>
      </FieldLabel>
      <Badge variant="secondary">继承自 网络设备</Badge>
      <Hint>从上级类别继承来的字段，改动要回到那个类别去。</Hint>
    </div>
    <Input id="fl-rack" placeholder="例如 A03-12U" />
  </Field>
)

/**
 * A label with a `Field` inside it becomes a choice card: bordered, padded,
 * and tinted with the primary once the box in it is checked. This is how a
 * pickable option is built here -- the whole card is the hit target, because
 * the card *is* the label.
 */
export const AsAChoiceCard = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <FieldLabel htmlFor="fl-cat">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>绑定到类别</FieldTitle>
          <FieldDescription>类别下的所有设备都会有这一项，子类别一并继承。</FieldDescription>
        </FieldContent>
        <Checkbox id="fl-cat" defaultChecked />
      </Field>
    </FieldLabel>
    <FieldLabel htmlFor="fl-model">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>绑定到型号</FieldTitle>
          <FieldDescription>只有这个型号的设备会有这一项。</FieldDescription>
        </FieldContent>
        <Checkbox id="fl-model" />
      </Field>
    </FieldLabel>
  </div>
)

/** Disabled travels from the field to the label: `Field` fades it, not you. */
export const Disabled = () => (
  <Field data-disabled="true">
    <FieldLabel htmlFor="fl-frozen">字段键</FieldLabel>
    <Input id="fl-frozen" className="font-mono" defaultValue="rack_position" disabled />
  </Field>
)
