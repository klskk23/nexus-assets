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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from "nexus-assets-web"

/**
 * The header is Title + Description and nothing else -- no stray `<p>`, no
 * `div + Label`. It stacks them with the gap the whole product uses, so two
 * dialogs opened one after the other have their first line in the same place.
 */
export const TitleAndDescription = () => (
  <Dialog defaultOpen>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>导出 CSV</DialogTitle>
        <DialogDescription>
          导出当前筛选下的 128 台设备。键名行不翻译 —— 回填时按它对齐。
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="dh-category">类别</FieldLabel>
          <Select defaultValue="network">
            <SelectTrigger id="dh-category">
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
          <Checkbox id="dh-attrs" defaultChecked />
          <FieldLabel htmlFor="dh-attrs">包含类别字段</FieldLabel>
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
 * The asset detail's header carries the subject itself: the number in mono, the
 * live status beside it, and the one action that belongs to the device rather
 * than to the form. `pe-10` keeps that row clear of the close × in the corner.
 */
export const CarriesTheSubject = () => (
  <Dialog defaultOpen>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-3 pe-10">
          <span className="font-mono">2199023255611</span>
          <StatusBadge status="in_stock" />
          <Button size="sm" variant="outline" className="ml-auto">
            打印标签
          </Button>
        </DialogTitle>
        <DialogDescription>网络设备 · 上海仓库 · 负责人 周文</DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <div>
          <dt className="text-muted-foreground text-[13px]">持有方</dt>
          <dd className="mt-0.5">上海仓库</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">保修截止</dt>
          <dd className="mt-0.5 tabular-nums">2027-04-30</dd>
        </div>
      </dl>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">关闭</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
