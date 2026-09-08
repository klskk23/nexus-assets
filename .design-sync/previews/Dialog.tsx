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
  StatusBadge,
  Timeline,
} from "nexus-assets-web"

/** Newest first, so the ringed 「当前」 entry is the one the device is on now. */
const recent = [
  {
    id: "t3",
    asset_id: "a1",
    batch_id: null,
    kind: "status_change",
    from_status: "checked_out",
    from_holder: { type: "user", id: "u7", name: "李珊" },
    from_owner_id: "u7",
    to_status: "repairing",
    to_holder: { type: "entity", id: "e2", name: "维修中心" },
    to_owner_id: "u7",
    note: "键盘进水，返厂检修",
    due_at: null,
    created_at: "2026-06-11T06:20:00Z",
    edited_at: null,
    edited_by: null,
    actor: { id: "u2", name: "周文" },
  },
  {
    id: "t2",
    asset_id: "a1",
    batch_id: null,
    kind: "checkout",
    from_status: "in_stock",
    from_holder: { type: "entity", id: "e1", name: "上海仓库" },
    from_owner_id: null,
    to_status: "checked_out",
    to_holder: { type: "user", id: "u7", name: "李珊" },
    to_owner_id: "u7",
    due_at: null,
    created_at: "2026-04-18T02:40:00Z",
    edited_at: null,
    edited_by: null,
    actor: { id: "u2", name: "周文" },
  },
  {
    id: "t1",
    asset_id: "a1",
    batch_id: null,
    kind: "create",
    from_status: null,
    from_holder: null,
    from_owner_id: null,
    to_status: "in_stock",
    to_holder: { type: "entity", id: "e1", name: "上海仓库" },
    to_owner_id: "u2",
    due_at: null,
    created_at: "2026-03-02T09:12:00Z",
    edited_at: null,
    edited_by: null,
    actor: { id: "u2", name: "周文" },
  },
]

/**
 * Every metadata editor in this product is a Dialog -- never a card that
 * expands in place, which would push the whole table down under the row being
 * edited. The root holds the open state and renders nothing itself; the box,
 * the dim behind it and the × in the corner all come from `DialogContent`.
 */
export const EditField = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Dialog defaultOpen>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑字段</DialogTitle>
          <DialogDescription>
            键名与类型在创建时就定下了，之后不能改 —— 已经按那个形状存下的值不会跟着变。
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="sm:grid sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="edit-field-key">键名</FieldLabel>
            <Input id="edit-field-key" className="font-mono" defaultValue="warranty_end" disabled />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-field-label">显示名称</FieldLabel>
            <Input id="edit-field-label" defaultValue="保修截止" />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-field-type">类型</FieldLabel>
            <Select defaultValue="date">
              <SelectTrigger id="edit-field-type" disabled>
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
            <Checkbox id="edit-field-required" defaultChecked />
            <FieldLabel htmlFor="edit-field-required">必填</FieldLabel>
            <Checkbox id="edit-field-unique" disabled />
            <FieldLabel htmlFor="edit-field-unique">唯一</FieldLabel>
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
 * The product's largest dialog: one device opened over the list it was clicked
 * in. It is an address rather than a piece of state -- a scan that matches one
 * device navigates straight here -- and the wide, scrolling content is what
 * carries identity, status and the last few movements without a page change.
 */
export const AssetDetail = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Dialog defaultOpen>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 pe-10">
            <span className="font-mono">2199023255611</span>
            <StatusBadge status="repairing" />
            <Button size="sm" variant="outline" className="ml-auto">
              打印标签
            </Button>
          </DialogTitle>
          <DialogDescription>网络设备 · 上海仓库 · 负责人 周文</DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gap: "0.5rem" }}>
          <span className="text-sm font-medium">最近流转</span>
          <Timeline events={recent} />
        </div>

        <DialogFooter>
          <Button variant="outline" style={{ marginRight: "auto" }}>
            完整历史
          </Button>
          <DialogClose asChild>
            <Button variant="ghost">关闭</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)

/**
 * With its trigger left in the frame: the button belongs to the toolbar it was
 * written in, and the dialog it opens is declared right next to it rather than
 * hoisted to the top of the page.
 */
export const FromATrigger = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <Button size="sm" variant="outline">
        变更状态
      </Button>
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            导出 CSV
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出 CSV</DialogTitle>
            <DialogDescription>
              导出当前筛选下的 128 台设备。键名行不翻译，回填时按它对齐。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="export-category">类别</FieldLabel>
              <Select defaultValue="network">
                <SelectTrigger id="export-category">
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
              <Checkbox id="export-attrs" defaultChecked />
              <FieldLabel htmlFor="export-attrs">包含类别字段</FieldLabel>
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
  </div>
)
