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
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * `FieldDescription` is deliberately rare here. A hint that says what to type
 * goes in the **placeholder**, and anything else somebody wants once hangs off
 * a question mark -- a line of prose under every control turns a form into an
 * essay.
 *
 * Left: the ordinary case, no description at all. Right: the exception -- a
 * consequence you should know *before* ticking cannot hide behind hover, so it
 * stays on the page.
 */
export const PlaceholderOrDescription = () => (
  <div style={{ display: "grid", gap: 28 }}>
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor="fd-key">字段键</FieldLabel>
        <Hint>建好后不能改，因为已经写进去的值是按这个键存的。</Hint>
      </div>
      <Input id="fd-key" className="font-mono" placeholder="小写英文与下划线，建好后不能改" />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>必填</FieldTitle>
        <FieldDescription>
          所有绑定都要求填；已经录入的 128 台设备下次编辑时才补。
        </FieldDescription>
      </FieldContent>
      <Checkbox id="fd-required" defaultChecked />
    </Field>
  </div>
)

/**
 * The second thing that must stay visible: a statement of current state. The
 * control is frozen and the sentence says why -- hidden behind a hover, that
 * reads as a broken dropdown.
 */
export const StatesTheCurrentState = () => (
  <FieldGroup>
    <Field>
      <FieldLabel htmlFor="fd-bind">绑定方式</FieldLabel>
      <Select defaultValue="model" disabled>
        <SelectTrigger id="fd-bind">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="category">绑定到类别</SelectItem>
            <SelectItem value="model">绑定到型号</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>已经绑定之后不能再换。要改就新建一个字段。</FieldDescription>
    </Field>
  </FieldGroup>
)
