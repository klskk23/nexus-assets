import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from "nexus-assets-web"

/**
 * The default box: `sm:max-w-lg`, centred, with its own Portal, Overlay and
 * close × already inside. A call site writes header / body / footer and
 * nothing else -- the dim and the escape hatch are not yours to remember.
 */
export const Default = () => (
  <Dialog defaultOpen>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>导出 CSV</DialogTitle>
        <DialogDescription>导出当前筛选下的 128 台设备。</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="dc-category">类别</FieldLabel>
          <Select defaultValue="network">
            <SelectTrigger id="dc-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="network">网络设备</SelectItem>
              <SelectItem value="laptop">笔记本</SelectItem>
              <SelectItem value="server">服务器</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="dc-attrs" defaultChecked />
          <FieldLabel htmlFor="dc-attrs">包含类别字段</FieldLabel>
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
)

/**
 * `className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"` -- the widened,
 * scrolling shape the asset detail takes. The cap matters more than the width:
 * without it a long device grows the box past the viewport and the footer
 * leaves the screen.
 */
export const Wide = () => (
  <Dialog defaultOpen>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-3 pe-10">
          <span className="font-mono">2199023255611</span>
          <StatusBadge status="checked_out" />
        </DialogTitle>
        <DialogDescription>网络设备 · 交换机 S5720-28X</DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-[13px]">持有方</dt>
          <dd className="mt-0.5">李珊</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">负责人</dt>
          <dd className="mt-0.5">周文</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">归属地</dt>
          <dd className="mt-0.5">上海仓库</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">序列号</dt>
          <dd className="mt-0.5 font-mono">21500-8842-77</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">保修截止</dt>
          <dd className="mt-0.5 tabular-nums">2027-04-30</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">入库日期</dt>
          <dd className="mt-0.5 tabular-nums">2026-03-02</dd>
        </div>
      </dl>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">关闭</Button>
        </DialogClose>
        <Button>保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

/**
 * A refusal raised inside a dialog has to be shown inside that dialog. The
 * page behind is `aria-hidden` and covered by the overlay, so a banner posted
 * up there is invisible and unreadable to a screen reader both -- the Alert
 * goes in the body, above the footer that asked for it.
 */
export const RefusalStaysInside = () => (
  <Dialog defaultOpen>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>新建字段</DialogTitle>
        <DialogDescription>键名在类别内唯一，建好之后不能改。</DialogDescription>
      </DialogHeader>
      <FieldGroup className="sm:grid sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="dc-key">键名</FieldLabel>
          <Input id="dc-key" className="font-mono" defaultValue="warranty_end" aria-invalid />
        </Field>
        <Field>
          <FieldLabel htmlFor="dc-label">显示名称</FieldLabel>
          <Input id="dc-label" defaultValue="保修截止" />
        </Field>
      </FieldGroup>
      <Alert variant="destructive">
        {/* A real <svg>, not a glyph in a span: Alert starts at
            grid-cols-[0_1fr] and only opens its icon column for an svg child,
            which the component then sizes itself. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <AlertTitle>键名已被占用</AlertTitle>
        <AlertDescription>
          「网络设备」上已经有一个 warranty_end。换一个键名，或者到那个字段上改它的显示名称。
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">取消</Button>
        </DialogClose>
        <Button>新建字段</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

/**
 * `showCloseButton={false}` takes the corner × away, leaving the footer as the
 * only way out. For the few dialogs where dismissing is itself an answer --
 * this one has already sent a batch to the printer, and walking away without
 * saying whether to send the second is not a state worth having.
 */
export const WithoutCloseButton = () => (
  <Dialog defaultOpen>
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>打印标签 · 第 2 批</DialogTitle>
        <DialogDescription>
          前 64 张已发往打印服务。余下 64 张要现在接着发吗？
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">停在这里</Button>
        </DialogClose>
        <Button>继续打印 64 张</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
