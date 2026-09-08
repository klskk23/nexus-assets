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

/**
 * The content carries its own top spacing (`pt-4`) rather than the trigger
 * carrying a bottom margin: shut, the section must take exactly the height of
 * one button, and a margin on the trigger leaves a gap under nothing.
 *
 * This is the 编辑属性 body from a device's detail dialog -- the home, the
 * model and the category's own fields, boxed so they do not read as more of
 * the movements above them.
 */
export const TheEditAttributesBody = () => (
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
          <FieldLabel htmlFor="cc-home">归属地</FieldLabel>
          <Select defaultValue="sh">
            <SelectTrigger id="cc-home">
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
          <FieldLabel htmlFor="cc-owner">负责人</FieldLabel>
          <Select defaultValue="keep">
            <SelectTrigger id="cc-owner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="keep">不变</SelectItem>
                <SelectItem value="zhang">张伟</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="cc-warranty">保修截止</FieldLabel>
          <Input id="cc-warranty" defaultValue="2028-03-31" />
        </Field>
        <Field>
          <FieldLabel htmlFor="cc-mac">MAC 地址</FieldLabel>
          <Input id="cc-mac" className="font-mono" defaultValue="00:1B:44:11:3A:B7" />
        </Field>
      </FieldGroup>
    </CollapsibleContent>
  </Collapsible>
)

/**
 * Anything the content holds is unmounted while shut, so nothing inside it can
 * be tabbed into by accident -- and nothing inside it is on screen to be read
 * either. A refusal or a warning therefore never goes in here; those stay on
 * the page.
 */
export const ShutHoldsNothing = () => (
  <Collapsible>
    <CollapsibleTrigger asChild>
      <Button variant="outline" className="w-fit">
        编辑属性
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="grid gap-6 pt-4">
      <FieldGroup className="grid gap-4 rounded-md border p-4">
        <Field>
          <FieldLabel htmlFor="cc-shut">保修截止</FieldLabel>
          <Input id="cc-shut" defaultValue="2028-03-31" />
        </Field>
      </FieldGroup>
    </CollapsibleContent>
  </Collapsible>
)
