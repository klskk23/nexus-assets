import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
  RadioGroup,
  RadioGroupItem,
} from "nexus-assets-web"

/**
 * The dot itself is 16px and carries no text of its own. Every one of them is
 * therefore paired with a `FieldLabel htmlFor` -- that is what makes the whole
 * line clickable and what a screen reader reads out. An item with no label is
 * a control nobody can name.
 *
 * `font-normal` on the label: the legend above is the emphasis, and bolding
 * every option flattens the difference between the question and its answers.
 */
export const Checked = () => (
  <FieldSet>
    <FieldLegend variant="label">导出范围</FieldLegend>
    <RadioGroup defaultValue="filtered">
      <Field orientation="horizontal">
        <RadioGroupItem value="ticked" id="rgi-ticked" />
        <FieldLabel htmlFor="rgi-ticked" className="font-normal">
          已勾选的 12 台
        </FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <RadioGroupItem value="filtered" id="rgi-filtered" />
        <FieldLabel htmlFor="rgi-filtered" className="font-normal">
          符合当前筛选的全部 137 台
        </FieldLabel>
      </Field>
    </RadioGroup>
  </FieldSet>
)

/**
 * Horizontal, for two short answers that read as one sentence. The group is a
 * `grid gap-3` by default, so a row needs the orientation said out loud on
 * both the group and the layout.
 */
export const InARow = () => (
  <FieldSet>
    <FieldLegend variant="label">标签朝向</FieldLegend>
    <RadioGroup defaultValue="landscape" orientation="horizontal" className="flex items-center gap-6">
      <Field orientation="horizontal" className="w-auto">
        <RadioGroupItem value="landscape" id="rgi-landscape" />
        <FieldLabel htmlFor="rgi-landscape" className="font-normal">
          横向
        </FieldLabel>
      </Field>
      <Field orientation="horizontal" className="w-auto">
        <RadioGroupItem value="portrait" id="rgi-portrait" />
        <FieldLabel htmlFor="rgi-portrait" className="font-normal">
          纵向
        </FieldLabel>
      </Field>
    </RadioGroup>
  </FieldSet>
)

/**
 * A whole group can be dead at once -- an installation with no print service
 * configured has no orientation to choose. Disabled and explained, never
 * removed.
 */
export const WholeGroupDisabled = () => (
  <FieldSet>
    <FieldLegend variant="label">标签朝向</FieldLegend>
    <RadioGroup defaultValue="landscape" disabled className="flex items-center gap-6">
      <Field orientation="horizontal" className="w-auto">
        <RadioGroupItem value="landscape" id="rgi-d-landscape" />
        <FieldLabel htmlFor="rgi-d-landscape" className="font-normal">
          横向
        </FieldLabel>
      </Field>
      <Field orientation="horizontal" className="w-auto">
        <RadioGroupItem value="portrait" id="rgi-d-portrait" />
        <FieldLabel htmlFor="rgi-d-portrait" className="font-normal">
          纵向
        </FieldLabel>
      </Field>
    </RadioGroup>
    <p className="text-muted-foreground text-xs">本安装未配置打印服务。</p>
  </FieldSet>
)
