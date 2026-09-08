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
  Field,
  FieldGroup,
  FieldLabel,
} from "nexus-assets-web"

/**
 * The description says what the confirm button will actually do, in the muted
 * size, directly under the title. It is the dialog's accessible description --
 * so it carries the caveat a reader needs before acting, not a restatement of
 * the title.
 */
export const SaysWhatWillHappen = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导出 CSV</DialogTitle>
          <DialogDescription>
            导出当前筛选下的 128 台设备。表头是键名不是显示名称，回填时按它对齐。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox id="dd-attrs" defaultChecked />
            <FieldLabel htmlFor="dd-attrs">包含类别字段</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="dd-archived" />
            <FieldLabel htmlFor="dd-archived">包含已归档字段</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">取消</Button>
          </DialogClose>
          <Button>导出</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)

/**
 * Where the action is batched, the description is where the batching is
 * admitted -- how many, in how many goes, and what stopping halfway leaves
 * behind. Numbers here save the operator from counting selected rows.
 */
export const NamesTheScope = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>打印标签</DialogTitle>
          <DialogDescription>
            128 张标签将分 2 批发往打印服务，每批 64 张。中途取消只会停下还没发出的那一批 ——
            已经进了打印队列的不会撤回。
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
