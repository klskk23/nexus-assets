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
  StatusBadge,
} from "nexus-assets-web"

/**
 * The title names the act, in as few words as the button that opened it --
 * 「编辑字段」, not 「编辑这个字段的设置」. It is also the dialog's accessible
 * name, which is why it is a `DialogTitle` and never a styled `<h2>`.
 */
export const NamesTheAct = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Dialog defaultOpen>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑字段</DialogTitle>
          <DialogDescription>键名与类型在创建时定下，之后不能改。</DialogDescription>
        </DialogHeader>
        <FieldGroup className="sm:grid sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="dt-key">键名</FieldLabel>
            <Input id="dt-key" className="font-mono" defaultValue="warranty_end" disabled />
          </Field>
          <Field>
            <FieldLabel htmlFor="dt-label">显示名称</FieldLabel>
            <Input id="dt-label" defaultValue="保修截止" />
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
)

/**
 * When the subject is a device rather than an act, the title becomes a row:
 * the number in mono so digits line up, the live status chip beside it, and
 * the device's own action pushed to the end with `ml-auto`. `pe-10` reserves
 * the corner the close × sits in.
 */
export const WithStatusAndAction = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Dialog defaultOpen>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 pe-10">
            <span className="font-mono">2199023255611</span>
            <StatusBadge status="repairing" />
            <Button size="sm" variant="outline" className="ml-auto">
              打印标签
            </Button>
          </DialogTitle>
          <DialogDescription>网络设备 · 维修中心 · 负责人 周文</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground text-[13px]">序列号</dt>
            <dd className="mt-0.5 font-mono">21500-8842-77</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-[13px]">送修日期</dt>
            <dd className="mt-0.5 tabular-nums">2026-06-11</dd>
          </div>
        </dl>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">关闭</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)
