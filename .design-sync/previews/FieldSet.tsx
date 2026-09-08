import {
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
} from "nexus-assets-web"

/**
 * A named section of a form -- a real `<fieldset>`, so the legend belongs to
 * the controls under it for a screen reader too.
 *
 * The description here is the exception `FieldDescription` exists for: a
 * statement of current state. 「这个账号来自 SSO」 decides whether the box below
 * can be used at all, so it cannot hide behind a question mark.
 */
export const NamedSection = () => (
  <FieldSet>
    <FieldLegend variant="label">重置密码</FieldLegend>
    <FieldDescription>给「张伟」设一个新密码。SSO 账号的密码不在这里管。</FieldDescription>
    <Field>
      <FieldLabel htmlFor="fst-pw">新密码</FieldLabel>
      <Input id="fst-pw" type="password" defaultValue="········" />
    </Field>
    <Button variant="outline" className="w-fit">
      重置密码
    </Button>
  </FieldSet>
)

/**
 * With a checkbox group inside, the set tightens its own spacing -- the rows
 * are one list, not four sections.
 */
export const AGroupOfChecks = () => (
  <FieldSet>
    <FieldLegend variant="label">导出哪些列</FieldLegend>
    {["资产编号", "型号", "状态", "持有方", "负责人"].map((label, i) => (
      <Field key={label} orientation="horizontal">
        <FieldLabel htmlFor={`fst-col-${i}`}>{label}</FieldLabel>
        <Checkbox id={`fst-col-${i}`} defaultChecked={i < 4} />
      </Field>
    ))}
  </FieldSet>
)
