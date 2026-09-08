import { Checkbox, Input, Label } from "nexus-assets-web"

/**
 * Always tied to its control by htmlFor -- a label that is only visually
 * adjacent is a label a screen reader cannot attribute, and a click target
 * two thirds smaller than it looks.
 */
export const WithInput = () => (
  <div className="grid max-w-sm gap-2">
    <Label htmlFor="p-name">显示名称</Label>
    <Input id="p-name" defaultValue="固件版本" />
  </div>
)

export const WithCheckbox = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="p-desc" defaultChecked />
    <Label htmlFor="p-desc">含子类别</Label>
  </div>
)
