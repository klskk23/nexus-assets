import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "nexus-assets-web"

/**
 * The text column of a horizontal field. A checkbox has no box to hide an
 * explanation in, so title and consequence stack here beside it -- and because
 * `FieldContent` is `flex-1`, the control keeps the right edge however long the
 * sentence runs.
 */
export const BesideACheckbox = () => (
  <Field orientation="horizontal">
    <FieldContent>
      <FieldTitle>必填</FieldTitle>
      <FieldDescription>
        所有绑定都要求填；已经录入的 128 台设备下次编辑时才补。
      </FieldDescription>
    </FieldContent>
    <Checkbox id="fc-required" defaultChecked />
  </Field>
)

/** Several of them in a group read as one settings list. */
export const AListOfToggles = () => (
  <FieldGroup>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>导出时包含继承字段</FieldTitle>
        <FieldDescription>从上级类别与厂商继承来的字段也写进 CSV。</FieldDescription>
      </FieldContent>
      <Checkbox id="fc-inherited" defaultChecked />
    </Field>
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>包含已报废设备</FieldTitle>
        <FieldDescription>默认只导出在库、已签出与维修中的设备。</FieldDescription>
      </FieldContent>
      <Checkbox id="fc-retired" />
    </Field>
  </FieldGroup>
)
