import {
  Alert,
  AlertDescription,
  AlertTitle,
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
 * `DialogClose asChild` wrapped around the button you already wrote is how
 * 取消 closes without the dialog's open state having to be threaded down into
 * the footer. The ghost variant is deliberate: dismissing is not an action, so
 * it does not compete with 保存 next to it.
 */
export const AsTheCancelButton = () => (
  <Dialog defaultOpen>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>编辑字段</DialogTitle>
        <DialogDescription>键名与类型在创建时定下，之后不能改。</DialogDescription>
      </DialogHeader>
      <FieldGroup className="sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="dcl-key">键名</FieldLabel>
          <Input id="dcl-key" className="font-mono" defaultValue="warranty_end" disabled />
        </Field>
        <Field>
          <FieldLabel htmlFor="dcl-label">显示名称</FieldLabel>
          <Input id="dcl-label" defaultValue="保修截止" />
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
 * Once the work is done there is nothing left to cancel, so the close becomes
 * the primary and only button. The same component, filled instead of ghost --
 * what changes is which button it wraps, not how it is closed.
 */
export const AsTheOnlyWayOut = () => (
  <Dialog defaultOpen>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>导出完成</DialogTitle>
        <DialogDescription>128 台设备已写入 assets-2026-09-08.csv。</DialogDescription>
      </DialogHeader>
      <Alert>
        <AlertTitle>表头是键名</AlertTitle>
        <AlertDescription>
          回填时不要把它改成显示名称 —— 导入按键名对齐，改过的表头会整列落空。
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <DialogClose asChild>
          <Button>完成</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
