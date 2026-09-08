import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * One row of a form. Every form in this product is built from `Field` inside a
 * `FieldGroup` -- never `div` + `Label` -- because the spacing, the disabled
 * fade and the invalid colour all hang off `Field`'s own data attributes.
 *
 * The hint for a text input goes in the placeholder, not under the box.
 */
export const Vertical = () => (
  <Field>
    <FieldLabel htmlFor="f-key">字段键</FieldLabel>
    <Input id="f-key" className="font-mono" placeholder="小写英文与下划线，建好后不能改" />
  </Field>
)

/**
 * A narrow control gets its width on the **Field**, not on the trigger inside
 * it. `Field` is `w-full` by default and stretches its children (`[&>*]:w-full`),
 * so `w-44` here sizes the label, the select and the description together --
 * whereas a width on the trigger alone leaves the field itself full-bleed and
 * the next control in the row misaligned.
 */
export const NarrowControl = () => (
  <Field className="w-44">
    <FieldLabel htmlFor="f-per-page">每页</FieldLabel>
    <Select defaultValue="50">
      <SelectTrigger id="f-per-page">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="20">20 条</SelectItem>
          <SelectItem value="50">50 条</SelectItem>
          <SelectItem value="100">100 条</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
)

/**
 * `orientation="horizontal"` puts the label first and lets it take the slack,
 * so the control lands on the right edge. With a `FieldContent` beside the box
 * the row aligns to the top instead of the middle.
 */
export const Horizontal = () => (
  <Field orientation="horizontal">
    <FieldContent>
      <FieldTitle>唯一</FieldTitle>
      <FieldDescription>类别子树内或所绑型号内不重复。建好后不能改。</FieldDescription>
    </FieldContent>
    <Checkbox id="f-unique" defaultChecked />
  </Field>
)
