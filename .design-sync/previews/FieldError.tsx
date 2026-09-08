import { Field, FieldError, FieldLabel, Input } from "nexus-assets-web"

/**
 * A refusal, and the third thing that may never hide behind a hover.
 *
 * `data-invalid` on the `Field` turns the label destructive; `aria-invalid` on
 * the control reddens its border and tells a screen reader the same thing. Set
 * both -- that is how the colour and the announcement cannot drift apart.
 */
export const OneMessage = () => (
  <Field data-invalid>
    <FieldLabel htmlFor="fe-sn">资产编号</FieldLabel>
    <Input
      id="fe-sn"
      className="font-mono"
      aria-invalid
      aria-describedby="fe-sn-error"
      defaultValue="NB-2024-0031"
    />
    <FieldError id="fe-sn-error" role="alert">
      资产编号已被「上海仓库 / 网络设备」下的另一台设备占用。
    </FieldError>
  </Field>
)

/**
 * Given the `errors` array instead of children, `FieldError` de-duplicates by
 * message and lays more than one out as a list. One message renders as a bare
 * line, so a single-error field never grows a stray bullet.
 */
export const SeveralMessages = () => (
  <Field data-invalid>
    <FieldLabel htmlFor="fe-mac">MAC 地址</FieldLabel>
    <Input id="fe-mac" className="font-mono" aria-invalid defaultValue="00:1A:2B:XX" />
    <FieldError
      errors={[
        { message: "不是合法的 MAC 地址。" },
        { message: "这台设备所在的类别要求填写这一项。" },
      ]}
    />
  </Field>
)
