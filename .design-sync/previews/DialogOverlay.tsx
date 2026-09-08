import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "nexus-assets-web"

const rows = [
  { sn: "2199023255611", holder: "上海仓库", status: "in_stock" },
  { sn: "2199023255612", holder: "李珊", status: "checked_out" },
  { sn: "2199023255613", holder: "维修中心", status: "repairing" },
]

/**
 * The overlay is the dimmed sheet between the page and the dialog. You never
 * write it -- `DialogContent` renders `DialogPortal` + this overlay around
 * itself, which is why every dialog in the product dims identically. The table
 * behind is real page content, so the dim is visible for what it does: it also
 * marks the page `aria-hidden`, which is why a refusal raised in the dialog has
 * to be shown in the dialog.
 */
export const OverPageContent = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <div style={{ width: "100%", maxWidth: "40rem" }}>
      <Card>
        <CardHeader>
          <CardTitle>网络设备</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>资产编号</TableHead>
                <TableHead>持有方</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.sn}>
                  <TableCell className="font-mono">{r.sn}</TableCell>
                  <TableCell>{r.holder}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog defaultOpen>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑字段</DialogTitle>
            <DialogDescription>键名与类型在创建时定下，之后不能改。</DialogDescription>
          </DialogHeader>
          <FieldGroup className="sm:grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="do-key">键名</FieldLabel>
              <Input id="do-key" className="font-mono" defaultValue="warranty_end" disabled />
            </Field>
            <Field>
              <FieldLabel htmlFor="do-label">显示名称</FieldLabel>
              <Input id="do-label" defaultValue="保修截止" />
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
    </div>
  </div>
)

/**
 * The same overlay under a small dialog: it is fixed to the viewport and
 * full-bleed however narrow the box above it is. Unlike an AlertDialog's, this
 * one is a way out -- clicking the dim closes a plain Dialog, which is why the
 * dialogs that must be answered pass `showCloseButton={false}` and say so.
 */
export const UnderASmallDialog = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <div style={{ width: "100%", maxWidth: "40rem" }}>
      <Card>
        <CardHeader>
          <CardTitle>已选 128 台</CardTitle>
        </CardHeader>
        <CardContent style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <StatusBadge status="in_stock" />
          <StatusBadge status="checked_out" />
          <StatusBadge status="repairing" />
          <StatusBadge status="retired" />
        </CardContent>
      </Card>

      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>打印标签</DialogTitle>
            <DialogDescription>128 张标签将分 2 批发往打印服务。</DialogDescription>
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
  </div>
)
