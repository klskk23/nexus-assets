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
  DialogTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
} from "nexus-assets-web"

/**
 * The portal lifts the dialog out of wherever it was written and into the
 * document body. `DialogContent` renders it for you -- a call site never writes
 * `DialogPortal` itself -- and that is the point: the editor below is declared
 * inside a clipped, fixed-height card and still lands centred over the whole
 * viewport instead of being cropped by its parent.
 */
export const EscapesItsParent = () => (
  <div style={{ width: "100%", maxWidth: "34rem" }}>
    <Card className="max-h-56 overflow-hidden">
      <CardHeader>
        <CardTitle>字段 · 保修截止</CardTitle>
      </CardHeader>
      <CardContent style={{ display: "grid", gap: "0.75rem" }}>
        <p className="text-sm text-muted-foreground">
          绑定在「网络设备」「服务器」两个类别上，已有 62 台设备填写过它。
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Dialog defaultOpen>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                编辑字段
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>编辑字段</DialogTitle>
                <DialogDescription>键名与类型在创建时定下，之后不能改。</DialogDescription>
              </DialogHeader>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="dp-key">键名</FieldLabel>
                  <Input id="dp-key" className="font-mono" defaultValue="warranty_end" disabled />
                </Field>
                <Field>
                  <FieldLabel htmlFor="dp-label">显示名称</FieldLabel>
                  <Input id="dp-label" defaultValue="保修截止" />
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
      </CardContent>
    </Card>
  </div>
)

/**
 * The same escape from a selection toolbar: the dialog is written next to the
 * 打印标签 button that owns it, and renders over the page rather than inside the
 * toolbar's own stacking context -- so no `z-index` on the toolbar can bury it.
 */
export const FromARowToolbar = () => (
  <div style={{ width: "100%", maxWidth: "34rem" }}>
    <Card>
      <CardHeader>
        <CardTitle>已选 128 台</CardTitle>
      </CardHeader>
      <CardContent style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
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
                128 张标签将分 2 批发往打印服务，每批 64 张。
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
      </CardContent>
    </Card>
  </div>
)
