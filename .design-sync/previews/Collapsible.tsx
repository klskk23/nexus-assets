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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so a card without this reads its `bg-card` and `bg-muted` parts as
   pale chips instead of as surfaces on a page. */
const ground = { background: "var(--background)", padding: "1rem" } as const
/**
 * What a device's detail dialog puts behind 编辑属性: the model, the home and
 * the category's own fields. They are edited once in a device's life, and open
 * by default they were taking the room a movement should have had.
 *
 * The Hint sits *beside* the trigger rather than inside the content, because
 * it is read while deciding whether to open the thing at all.
 */
export const EditAttributes = () => (
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
            <FieldLabel htmlFor="cl-home">归属地</FieldLabel>
            <Select defaultValue="sh">
              <SelectTrigger id="cl-home">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="sh">上海仓库（默认库存点）</SelectItem>
                  <SelectItem value="bj">北京机房</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="cl-model">型号</FieldLabel>
            <Input id="cl-model" defaultValue="Cisco Catalyst 9200" />
          </Field>
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  </div>
)

/**
 * Categories nest, so a nested Collapsible is the shape they used to be drawn
 * in: each level is a trigger, and its children are its content.
 *
 * Historical note for anyone reaching for this: the category page no longer
 * builds its tree this way. `CollapsibleTree` was removed in round 014 when
 * the tree moved into a table, where it sorts and pages like every other list.
 * This composition stands for the pattern, not for that screen.
 */
export const NestedCategories = () => (
  <div style={ground}>
    <Collapsible defaultOpen className="text-sm">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-fit">
          网络设备 · 137 台
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent style={{ paddingInlineStart: 20 }}>
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-fit">
              交换机 · 84 台
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent style={{ paddingInlineStart: 20 }}>
            <div className="text-muted-foreground" style={{ padding: "4px 12px" }}>
              接入交换机 · 61 台
            </div>
            <div className="text-muted-foreground" style={{ padding: "4px 12px" }}>
              核心交换机 · 23 台
            </div>
          </CollapsibleContent>
        </Collapsible>
        <Button variant="ghost" size="sm" className="w-fit">
          路由器 · 39 台
        </Button>
      </CollapsibleContent>
    </Collapsible>
  </div>
)
