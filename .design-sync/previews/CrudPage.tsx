import {
  Badge,
  CrudPage,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so a card without this reads its `bg-card` and `bg-muted` parts as
   pale chips instead of as surfaces on a page. */
const ground = { background: "var(--background)", padding: "1rem" } as const
/**
 * The whole shape of a metadata page, in one component. Eight screens use it
 * -- 字段 / 类别 / 型号 / 厂商 / 持有方 / 账号 / 状态 / 字段组 -- and they
 * differ only in their columns and their form. Everything else is here once:
 * the header and its create dialog, the search-and-filters row, the three
 * states (loading, empty, failed), the table, the pager, and the confirmation
 * a destructive row action raises.
 *
 * Keeping the plumbing in one place is what stops loading, empty and error
 * handling from drifting apart across eight screens. Do not build a ninth
 * metadata page by hand.
 *
 * Three of its props are load-bearing and easy to get wrong:
 *
 * - `list(params)` is given the search, the filters and the paging the toolbar
 *   is holding, and may answer either a plain array or `{items, total}`. A
 *   list of five statuses does not need a round trip to prove it is short.
 * - `form` is a node that lives on the page; `onCreated` clears it. It is
 *   required, not optional -- a dialog that reopens holding the last thing you
 *   created is a trap where you edit one field, submit, and quietly make a
 *   near-duplicate.
 * - `rowActions` is what right-clicking a row offers. Actions live in a
 *   context menu rather than a column of buttons, because the buttons were
 *   competing with the data for width on every screen and most of them are
 *   used once a month.
 *
 * The cards here supply `list` as a resolved promise, which is exactly the
 * contract -- no server is involved.
 */

interface FieldRow {
  id: string
  key: string
  label: string
  type: string
  binding: string
}

const FIELD_ROWS: FieldRow[] = [
  { id: "1", key: "serial_no", label: "序列号", type: "文本", binding: "类别 · 网络设备" },
  { id: "2", key: "mac_address", label: "MAC 地址", type: "文本", binding: "型号 · Catalyst 9200" },
  { id: "3", key: "warranty_until", label: "保修截止", type: "日期", binding: "厂商 · 思科" },
  { id: "4", key: "rack_unit", label: "机柜位", type: "数字", binding: "类别 · 网络设备" },
  { id: "5", key: "purchase_price", label: "采购价", type: "数字", binding: "未绑定" },
]

const columns = [
  { header: "键名", cell: (r: FieldRow) => <span className="font-mono text-sm">{r.key}</span> },
  { header: "显示名", cell: (r: FieldRow) => r.label },
  { header: "类型", cell: (r: FieldRow) => r.type },
  { header: "绑定", cell: (r: FieldRow) => <Badge variant="outline">{r.binding}</Badge> },
]

const fieldForm = (
  <FieldGroup className="grid gap-4 sm:grid-cols-2">
    <Field>
      <FieldLabel htmlFor="cp-key">键名（英文）</FieldLabel>
      <Input id="cp-key" className="font-mono" placeholder="小写英文与下划线，建好后不能改" />
    </Field>
    <Field>
      <FieldLabel htmlFor="cp-label">显示名</FieldLabel>
      <Input id="cp-label" />
    </Field>
  </FieldGroup>
)

const typeFilter = (
  <Select defaultValue="__all">
    <SelectTrigger className="w-40" aria-label="类型">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="__all">全部类型</SelectItem>
        <SelectItem value="text">文本</SelectItem>
        <SelectItem value="number">数字</SelectItem>
        <SelectItem value="date">日期</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)

export const FieldsPage = () => (
  <div style={ground}>
    <CrudPage
      title="字段"
      queryKey="preview-fields"
      list={async () => ({ items: FIELD_ROWS, total: 137 })}
      searchHint="键名、显示名"
      filters={() => typeFilter}
      columns={columns}
      create={async () => undefined}
      createLabel="新建字段"
      emptyTitle="还没有任何字段"
      emptyHint="字段是全局共用的：同名字段在全系统含义一致。建好后到类别页绑定。"
      form={fieldForm}
      onCreated={() => {}}
      onRowClick={() => {}}
      rowActions={[
        { label: "编辑", onSelect: () => {} },
        {
          label: "删除",
          destructive: true,
          onSelect: () => {},
          confirm: (row: FieldRow) => ({
            title: "删除字段",
            description: `「${row.label}」将被彻底移除，包括它在各类别上的绑定。`,
            phrase: row.key,
          }),
        },
      ]}
    />
  </div>
)

/**
 * The empty state is the page's, not the table's: the header and the create
 * button stay, because the answer to "there is nothing here" is the button
 * that makes the first one. The hint says what the records are *for*, since
 * somebody reading it has never made one.
 */
export const NothingYet = () => (
  <div style={ground}>
    <CrudPage
      title="厂商"
      queryKey="preview-vendors-empty"
      list={async () => []}
      searchHint="名称"
      columns={[
        { header: "名称", cell: (r: { id: string; name: string }) => r.name },
        { header: "型号数", cell: () => "0" },
      ]}
      create={async () => undefined}
      createLabel="新建厂商"
      emptyTitle="还没有任何厂商"
      emptyHint="厂商下面挂型号；绑在厂商上的字段，它旗下所有型号的设备都会有。"
      form={
        <Field>
          <FieldLabel htmlFor="cp-vendor">名称</FieldLabel>
          <Input id="cp-vendor" />
        </Field>
      }
      onCreated={() => {}}
    />
  </div>
)

/**
 * Without the permission the create button is disabled and says why, rather
 * than disappearing -- a colleague who cannot see 新建持有方 has no way to
 * learn the feature exists, let alone who can open it for them. Row actions
 * follow the same rule through their own `disabled`.
 */
export const CreateDenied = () => (
  <div style={ground}>
    <CrudPage
      title="持有方"
      queryKey="preview-holders"
      list={async () => [
        { id: "1", name: "上海仓库", kind: "位置" },
        { id: "2", name: "北京机房", kind: "位置" },
        { id: "3", name: "研发部", kind: "部门" },
      ]}
      searchHint="名称"
      columns={[
        { header: "名称", cell: (r: { id: string; name: string; kind: string }) => r.name },
        {
          header: "类型",
          cell: (r: { id: string; name: string; kind: string }) => (
            <Badge variant="outline">{r.kind}</Badge>
          ),
        },
      ]}
      create={async () => undefined}
      createLabel="新建持有方"
      createDeniedReason="需要「管理持有方」权限，请联系管理员"
      emptyTitle="还没有任何持有方"
      emptyHint="公司、位置或部门。设备可以签给一个人，也可以签给其中之一。"
      form={
        <Field>
          <FieldLabel htmlFor="cp-holder">名称</FieldLabel>
          <Input id="cp-holder" />
        </Field>
      }
      onCreated={() => {}}
    />
  </div>
)
