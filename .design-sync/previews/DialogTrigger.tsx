import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * `asChild` is the whole contract: the trigger is not a button of its own, it
 * hands its behaviour to the `Button` you already wrote, so the page keeps one
 * primary action rather than growing a second one that only opens things.
 */
export const AsChildButton = () => (
  <div style={{ display: "flex" }}>
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>＋ 新建字段</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建字段</DialogTitle>
          <DialogDescription>
            键名、类型与唯一性只在这里能定 —— 建好之后它们就冻住了。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="sm:grid sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="new-field-key">键名</FieldLabel>
            <Input id="new-field-key" className="font-mono" placeholder="warranty_end" />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-field-label">显示名称</FieldLabel>
            <Input id="new-field-label" placeholder="保修截止" />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-field-type">类型</FieldLabel>
            <Select defaultValue="text">
              <SelectTrigger id="new-field-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">文本</SelectItem>
                <SelectItem value="number">数字</SelectItem>
                <SelectItem value="date">日期</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" style={{ alignSelf: "end" }}>
            <Checkbox id="new-field-required" />
            <FieldLabel htmlFor="new-field-required">必填</FieldLabel>
            <Checkbox id="new-field-unique" />
            <FieldLabel htmlFor="new-field-unique">唯一</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">取消</Button>
          </DialogClose>
          <Button>新建字段</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)

/**
 * One trigger among several plain buttons in a selection toolbar. The dialog
 * is written where the action lives, and only the button that owns it becomes
 * a trigger -- the others stay ordinary buttons.
 */
export const InARowToolbar = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
    <span className="text-sm text-muted-foreground">已选 128 台</span>
    <Button size="sm" variant="outline">
      变更状态
    </Button>
    <Button size="sm" variant="outline">
      导出 CSV
    </Button>
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          打印标签
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>打印标签</DialogTitle>
          <DialogDescription>
            128 张标签将分 2 批发往打印服务，每批 64 张。中途取消只会停下还没发出的那一批。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">取消</Button>
          </DialogClose>
          <Button>打印 128 张</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)
