import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * The card ground here is painted `var(--background)` on purpose: the label
 * variant below punches a hole in the rule with a `bg-background` chip, which
 * only disappears into the page when the page is the app's own cream.
 */
const page: React.CSSProperties = {
  background: "var(--background)",
  borderRadius: 16,
  padding: 20,
}

/**
 * A rule between two halves of one form. It sits inside the `FieldGroup` and
 * eats its own margin, so the gap above and below stays the group's rhythm
 * rather than doubling.
 */
export const BetweenTwoHalves = () => (
  <FieldGroup style={page}>
    <Field>
      <FieldLabel htmlFor="fs-key">字段键</FieldLabel>
      <Input id="fs-key" className="font-mono" placeholder="小写英文与下划线，建好后不能改" />
    </Field>
    <FieldSeparator />
    <Field className="w-56">
      <FieldLabel htmlFor="fs-cat">绑定类别</FieldLabel>
      <Select defaultValue="net">
        <SelectTrigger id="fs-cat">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="net">网络设备</SelectItem>
            <SelectItem value="srv">服务器</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  </FieldGroup>
)

/**
 * With children the rule breaks around a word. Use it to name what follows,
 * not to apologise for it -- the label reads as a section heading at rule
 * height.
 */
export const WithALabel = () => (
  <FieldGroup style={page}>
    <Field>
      <FieldLabel htmlFor="fs-label">显示名</FieldLabel>
      <Input id="fs-label" defaultValue="机架位置" />
    </Field>
    <FieldSeparator>以下为选填</FieldSeparator>
    <Field>
      <FieldLabel htmlFor="fs-regex">正则校验</FieldLabel>
      <Input id="fs-regex" className="font-mono" placeholder="^[A-Z]{2}-\d{4}$" />
    </Field>
  </FieldGroup>
)
