import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
} from "nexus-assets-web"

/**
 * The heading of a `FieldSet`. `variant="legend"` is the default and the
 * bigger of the two -- for a section a reader scans for.
 */
export const SectionHeading = () => (
  <FieldSet>
    <FieldLegend>导出范围</FieldLegend>
    <FieldDescription>只导出当前筛选出的 128 台设备，不含已报废。</FieldDescription>
    <Field>
      <FieldLabel htmlFor="fle-name">文件名</FieldLabel>
      <Input id="fle-name" defaultValue="assets-2026-09-08.csv" />
    </Field>
  </FieldSet>
)

/**
 * `variant="label"` drops it to label size -- for a group of controls inside a
 * dialog that already has a title, where a second heading at full size would
 * compete with it.
 */
export const LabelSized = () => (
  <FieldSet>
    <FieldLegend variant="label">重置密码</FieldLegend>
    <FieldDescription>给「张伟」设一个新密码，下次登录时生效。</FieldDescription>
    <Field>
      <FieldLabel htmlFor="fle-pw">新密码</FieldLabel>
      <Input id="fle-pw" type="password" defaultValue="········" />
    </Field>
  </FieldSet>
)
