import {
  Badge,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "nexus-assets-web"

/**
 * The bold line at the top of a `FieldContent`. It looks like a label but is
 * not one -- it has no `htmlFor`, so use it where the clickable label is
 * somewhere else (here, the whole card) and this is only the name of the row.
 */
export const InAChoiceCard = () => (
  <FieldLabel htmlFor="ft-model">
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>绑定到型号</FieldTitle>
        <FieldDescription>只有 ThinkPad T14 Gen 5 的设备会有这一项。</FieldDescription>
      </FieldContent>
      <Checkbox id="ft-model" defaultChecked />
    </Field>
  </FieldLabel>
)

/** It is `w-fit` and a flex row, so a badge sits on the same line as the name. */
export const WithABadge = () => (
  <FieldGroup>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>
          机架位置
          <Badge variant="outline">唯一</Badge>
        </FieldTitle>
        <FieldDescription>类别子树内不重复。建好后不能改。</FieldDescription>
      </FieldContent>
      <Checkbox id="ft-rack" defaultChecked />
    </Field>
  </FieldGroup>
)
