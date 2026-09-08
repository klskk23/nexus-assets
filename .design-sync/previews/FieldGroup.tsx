import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Hint,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * The wrapper every form in this product opens with: it owns the vertical
 * rhythm between fields, so no `Field` ever carries a margin of its own.
 *
 * A two-column form is this group plus `sm:grid sm:grid-cols-2` -- the fields
 * stay ordinary, the grid lives one level up.
 */
export const TwoColumnGrid = () => (
  <FieldGroup className="sm:grid sm:grid-cols-2">
    <Field>
      <FieldLabel htmlFor="fg-key">字段键</FieldLabel>
      <Input id="fg-key" className="font-mono" placeholder="小写英文与下划线，建好后不能改" />
    </Field>
    <Field>
      <FieldLabel htmlFor="fg-label">显示名</FieldLabel>
      <Input id="fg-label" defaultValue="机架位置" />
    </Field>
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor="fg-type">类型</FieldLabel>
        <Hint>建好后不能改。</Hint>
      </div>
      <Select defaultValue="text">
        <SelectTrigger id="fg-type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>录入</SelectLabel>
            <SelectItem value="text">文本</SelectItem>
            <SelectItem value="number">数字</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>计算</SelectLabel>
            <SelectItem value="computed">计算项</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
    <Field>
      <FieldLabel htmlFor="fg-regex">正则校验</FieldLabel>
      <Input id="fg-regex" className="font-mono" placeholder="^[A-Z]{2}-\d{4}$" />
    </Field>
  </FieldGroup>
)

/** Stacked is the default -- one column, wider gaps, no class needed. */
export const Stacked = () => (
  <FieldGroup>
    <Field>
      <FieldLabel htmlFor="fg-name">密钥名称</FieldLabel>
      <Input id="fg-name" placeholder="标签打印机" />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>只读</FieldTitle>
        <FieldDescription>这把密钥只能读设备与流转记录，不能写。</FieldDescription>
      </FieldContent>
      <Checkbox id="fg-ro" defaultChecked />
    </Field>
  </FieldGroup>
)
