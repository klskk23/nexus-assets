import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Hint,
  Input,
} from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so a card without this reads its `bg-card` and `bg-muted` parts as
   pale chips instead of as surfaces on a page. */
const ground = { background: "var(--background)", padding: "1rem" } as const
/**
 * The trigger is always `asChild` around a real Button in this product -- the
 * primitive renders a bare `<button>` otherwise, and an unstyled button in the
 * middle of a styled form reads as something half-built.
 *
 * Closed is the state the detail dialog opens in: one outline button and
 * nothing else, so the movements below it get the room.
 */
export const Closed = () => (
  <div style={ground}>
    <Collapsible>
      <div className="flex items-center gap-1.5">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-fit">
            编辑属性
          </Button>
        </CollapsibleTrigger>
        <Hint>型号、归属地和类别字段，改的是这台设备本身，不产生一条流转记录。</Hint>
      </div>
      <CollapsibleContent className="grid gap-6 pt-4">
        <FieldGroup className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ct-a-sn">资产编号</FieldLabel>
            <Input id="ct-a-sn" defaultValue="NX-2024-0417" />
          </Field>
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  </div>
)

/** The same trigger after it has been pressed. The label does not change --
 *  it names the section, not the gesture, so it stays findable either way. */
export const Open = () => (
  <div style={ground}>
    <Collapsible defaultOpen>
      <div className="flex items-center gap-1.5">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-fit">
            编辑属性
          </Button>
        </CollapsibleTrigger>
        <Hint>型号、归属地和类别字段，改的是这台设备本身，不产生一条流转记录。</Hint>
      </div>
      <CollapsibleContent className="grid gap-6 pt-4">
        <FieldGroup className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ct-b-sn">资产编号</FieldLabel>
            <Input id="ct-b-sn" defaultValue="NX-2024-0417" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ct-b-model">型号</FieldLabel>
            <Input id="ct-b-model" defaultValue="Cisco Catalyst 9200" />
          </Field>
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  </div>
)

/**
 * A quieter trigger, for a section that is part of the reading rather than an
 * editor: the count is on the label so the row still answers something when it
 * is shut.
 */
export const AsAGhostRow = () => (
  <div style={ground}>
    <Collapsible defaultOpen className="text-sm">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-fit">
          历史值 · 3 条
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent style={{ paddingInlineStart: 20, paddingTop: 4 }}>
        <div className="text-muted-foreground" style={{ padding: "2px 0" }}>
          保修截止 2027-03-31 → 2028-03-31
        </div>
        <div className="text-muted-foreground" style={{ padding: "2px 0" }}>
          归属地 北京机房 → 上海仓库
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
)
