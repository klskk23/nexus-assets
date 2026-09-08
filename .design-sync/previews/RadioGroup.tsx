import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Hint,
  RadioGroup,
  RadioGroupItem,
} from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so a card without this reads its `bg-card` and `bg-muted` parts as
   pale chips instead of as surfaces on a page. */
const ground = { background: "var(--background)", padding: "1rem" } as const
/**
 * One answer out of a few, all of them worth reading at once. Where the list
 * would run past five, or where the options are records rather than modes,
 * this product reaches for `Select` instead.
 *
 * The export dialog's first question: are we exporting what was ticked, or
 * what the filters currently match? Both counts are on the labels, because
 * "the filtered ones" is not a number anybody can hold in their head.
 *
 * Each option is a `Field orientation="horizontal"` so the label is the click
 * target as well -- a 16px circle is not one.
 */
export const ExportScope = () => (
  <div style={ground}>
    <FieldSet>
      <div className="mb-3 flex items-center gap-1.5">
        <FieldLegend variant="label" className="mb-0">
          导出范围
        </FieldLegend>
        <Hint>勾选是临时的，筛选是可以分享的：把地址发给同事，他看到的是同一批设备。</Hint>
      </div>
      <RadioGroup defaultValue="ticked">
        <Field orientation="horizontal">
          <RadioGroupItem value="ticked" id="rg-ticked" />
          <FieldLabel htmlFor="rg-ticked" className="font-normal">
            已勾选的 12 台
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="filtered" id="rg-filtered" />
          <FieldLabel htmlFor="rg-filtered" className="font-normal">
            符合当前筛选的全部 137 台
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  </div>
)

/**
 * An option that cannot be taken is disabled and left in place, with the
 * reason on it -- removing it would leave a list that quietly means something
 * different depending on who is looking.
 */
export const WithOneUnavailable = () => (
  <div style={ground}>
    <FieldSet>
      <FieldLegend variant="label">导入冲突时</FieldLegend>
      <RadioGroup defaultValue="skip">
        <Field orientation="horizontal">
          <RadioGroupItem value="skip" id="rg-skip" />
          <FieldLabel htmlFor="rg-skip" className="font-normal">
            跳过这一行
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="update" id="rg-update" />
          <FieldLabel htmlFor="rg-update" className="font-normal">
            覆盖已有设备
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="abort" id="rg-abort" disabled />
          <FieldLabel htmlFor="rg-abort" className="font-normal">
            整批拒绝（需要「导入」权限）
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  </div>
)
