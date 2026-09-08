import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
} from "nexus-assets-web"

/**
 * The footer is one row at the end: dismiss on the left, the act on the right,
 * and the act is the only filled button in the dialog. Below `sm` it stacks in
 * reverse so the primary lands under the thumb rather than above the cancel.
 */
export const CancelAndSave = () => (
  <Dialog defaultOpen>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>编辑字段</DialogTitle>
        <DialogDescription>键名与类型在创建时定下，之后不能改。</DialogDescription>
      </DialogHeader>
      <FieldGroup className="sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="df-key">键名</FieldLabel>
          <Input id="df-key" className="font-mono" defaultValue="warranty_end" disabled />
        </Field>
        <Field>
          <FieldLabel htmlFor="df-label">显示名称</FieldLabel>
          <Input id="df-label" defaultValue="保修截止" />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">取消</Button>
        </DialogClose>
        <Button>保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

/**
 * The confirm button carries the count, so the row that is about to be acted on
 * is readable without looking back up at the description.
 */
export const ConfirmsABatch = () => (
  <Dialog defaultOpen>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>打印标签</DialogTitle>
        <DialogDescription>128 张标签将分 2 批发往打印服务，每批 64 张。</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">取消</Button>
        </DialogClose>
        <Button>打印 128 张</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

/**
 * A destructive action lives in the same row but at the far end -- pushed left
 * with `marginRight: auto`. Near enough to find, far enough from 保存 not to be
 * hit on the way to it; and it still opens a confirm of its own before acting.
 */
export const DestructiveAtTheFarEnd = () => (
  <Dialog defaultOpen>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>编辑字段</DialogTitle>
        <DialogDescription>
          「保修截止」绑定在 2 个类别上，62 台设备填写过它。
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="df2-key">键名</FieldLabel>
          <Input id="df2-key" className="font-mono" defaultValue="warranty_end" disabled />
        </Field>
        <Field>
          <FieldLabel htmlFor="df2-label">显示名称</FieldLabel>
          <Input id="df2-label" defaultValue="保修截止" />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="destructive" style={{ marginRight: "auto" }}>
          删除字段
        </Button>
        <DialogClose asChild>
          <Button variant="ghost">取消</Button>
        </DialogClose>
        <Button>保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
