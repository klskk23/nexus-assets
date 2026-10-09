import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { useLocation } from "react-router"
import { CategoryEditor } from "@/features/categories/CategoryEditor"
import { Toaster } from "@/components/ui/sonner"
import { Categories } from "@/routes/Categories"
import { api, ApiError } from "@/lib/api"
import { applyLang } from "@/i18n"
import { chooseByLabel } from "@/test/choose"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { Category } from "@/lib/types"

const post = vi.fn(), patch = vi.fn(), get = vi.fn()
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { post: (p: string, b: unknown) => post(p, b), patch: (p: string, b: unknown) => patch(p, b), get: (p: string) => get(p), del: vi.fn() },
}))
const categories: Category[] = [
  { id: "root", name: "祖先", code: "ROOT", path: "/root/", parent_id: null, display_key: "" },
  { id: "parent", name: "父类", code: "P", path: "/root/parent/", parent_id: "root", display_key: "" },
  { id: "other", name: "新父类", code: "O", path: "/other/", parent_id: null, display_key: "" },
  { id: "child", name: "子类", code: "C", path: "/root/parent/child/", parent_id: "parent", display_key: "", print_preset_ids: [] },
]
const field = (i: number) => ({ id: `f${i}`, key: `key${i}`, label: `字段 ${i}`, type: "text" as const, options: {}, required: i === 0, is_unique: false, sort: i })
const direct = { ...field(999), label: "自身字段" }
let saved: string[], count: number
let failPreview = false
let blockWithdrawal = false
interface Body { inherited_field_ids?: string[]; parent_id?: string | null; display_key?: string; name?: string; code?: string; print_preset_ids?: string[] }
function page<T>(items: T[], url: URL, prefix: string) {
  const offset = Number(url.searchParams.get(`${prefix}_offset`) ?? 0)
  const limit = Number(url.searchParams.get(`${prefix}_limit`) ?? 50)
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
}
function preview(path: string, body: Body) {
  const url = new URL(path, "http://test")
  const creating = url.pathname === "/categories/preview"
  const parent = body.parent_id === undefined ? "parent" : body.parent_id
  const available = parent ? Array.from({ length: count }, (_, i) => field(i)).filter((f) => parent !== "other" || f.id !== "f0") : []
  const selected = body.inherited_field_ids ?? (creating ? [] : saved.filter((id) => available.some((f) => f.id === id)))
  const fields = [...available.filter((f) => selected.includes(f.id)).map((f) => ({ ...f, inherited_from: "root" })), ...(!creating ? [direct] : [])]
  const issues = body.display_key && !fields.some((f) => f.key === body.display_key) ? [{ code: "display_key_unbound", message: "编号字段不在最终字段中", field_key: body.display_key, category_id: "child" }] : []
  const removed = blockWithdrawal && saved.some((id) => !selected.includes(id))
  return { category: { ...categories[3], ...body }, inheritance: { parent_id: parent, selected_field_ids: selected, candidates: page(available.map((f) => ({ field: f, source_category_id: "root", selected: selected.includes(f.id) })), url, "candidates") }, fields,
    impact: { ...page([], url, "impact"), added_count: 0, removed_count: removed ? 1 : 0, source_changed_count: 0, category_count: 0, asset_count: 0 },
    issues: page(issues, url, "issues"), requires_confirmation: removed, confirmation_token: "" }
}
function respond(p: string, b: Body) {
  if (p.includes("/preview")) return failPreview ? Promise.reject(new ApiError(503, "unavailable", "预览暂不可用")) : Promise.resolve(preview(p, b))
  return Promise.resolve({})
}
beforeEach(() => {
  applyLang("zh")
  saved = ["f0", "f24"]; count = 25; failPreview = false; blockWithdrawal = false
  post.mockReset().mockImplementation(respond)
  patch.mockReset().mockResolvedValue({})
  get.mockReset().mockImplementation((p: string) => Promise.resolve(p === "/categories" ? categories : p === "/categories/counts" ? {} : p === "/capabilities" ? { printing: true } : p === "/print/presets" ? { presets: [{ id: "label", name: "测试标签" }] } : { category: categories[3], fields: [direct] }))
})
function editor(opts: { permissions?: string[] } = {}) {
  return renderWithProviders(<CategoryEditor category={categories[3]} categories={categories} onClose={vi.fn()} />, opts)
}
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()) }

it("loads the complete saved selection, displays original source/type/required and never offers direct bindings", async () => {
  editor()
  expect(await screen.findByRole("checkbox", { name: "字段 0" })).toBeChecked()
  expect(screen.getByRole("row", { name: /字段 0/ })).toHaveTextContent("祖先")
  expect(screen.getByRole("row", { name: /字段 0/ })).toHaveTextContent("文本")
  expect(screen.getByRole("row", { name: /字段 0/ })).toHaveTextContent("必填")
  expect(screen.queryByRole("checkbox", { name: "自身字段" })).not.toBeInTheDocument()
})
it("keeps off-page selection, edits only a draft, and sends every property in one save", async () => {
  const user = userEvent.setup(); editor()
  await user.click(await screen.findByRole("checkbox", { name: "字段 1" }))
  await user.click(screen.getByRole("link", { name: "下一页" }))
  expect(await screen.findByRole("checkbox", { name: "字段 24" })).toBeChecked()
  await user.click(screen.getByRole("checkbox", { name: "测试标签" }))
  await chooseByLabel(user, "用作编号的字段", "字段 24（key24）")
  expect(patch).not.toHaveBeenCalled()
  expect(post.mock.calls.every(([p]) => p.includes("/preview"))).toBe(true)
  await ready(); await user.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(patch).toHaveBeenCalledWith("/categories/child", { name: "子类", parent_id: "parent", display_key: "key24", print_preset_ids: ["label"], inherited_field_ids: ["f0", "f24", "f1"] }))
})
it("creates with an explicit empty selection and cancels without any writes", async () => {
  const user = userEvent.setup()
  renderWithProviders(<Categories />, { route: "/categories/child", path: "/categories/:id" })
  await user.click(await screen.findByRole("button", { name: "新建类别" }))
  await chooseByLabel(user, "上级类别", "父类")
  expect(await screen.findByRole("checkbox", { name: "字段 0" })).not.toBeChecked()
  await user.click(screen.getByRole("checkbox", { name: "字段 0" }))
  await user.click(screen.getByRole("button", { name: "取消" }))
  expect(post.mock.calls.every(([p]) => p.includes("/preview"))).toBe(true)
  await user.click(screen.getByRole("button", { name: "新建类别" }))
  const dialog = await screen.findByRole("dialog")
  await user.type(within(dialog).getByLabelText(/代号/), "NEW")
  await user.type(within(dialog).getByLabelText("名称"), "新类")
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "新建类别" })).toBeEnabled())
  await user.click(within(dialog).getByRole("button", { name: "新建类别" }))
  await waitFor(() => expect(post).toHaveBeenCalledWith("/categories", { code: "NEW", name: "新类", parent_id: null, display_key: "", print_preset_ids: [], inherited_field_ids: [] }))
})
it("intersects the current unsaved choices against ALL new-parent candidate pages", async () => {
  count = 205; saved = ["f0", "f204"]
  const user = userEvent.setup(); editor()
  await user.click(await screen.findByRole("checkbox", { name: "字段 1" }))
  await chooseByLabel(user, "上级类别", "新父类")
  await ready(); await user.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(patch).toHaveBeenCalledWith("/categories/child", expect.objectContaining({ parent_id: "other", inherited_field_ids: ["f204", "f1"] })))
})
it("ignores late parent previews and does not enable saving during the new preview", async () => {
  let release!: (value: ReturnType<typeof preview>) => void
  const pending = new Promise<ReturnType<typeof preview>>((resolve) => { release = resolve })
  const user = userEvent.setup(); editor(); await ready()
  post.mockImplementation((p: string, b: Body) => b.parent_id === "other" ? pending : respond(p, b))
  await chooseByLabel(user, "上级类别", "新父类")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  await chooseByLabel(user, "上级类别", "父类")
  await ready()
  await act(async () => { release(preview("/categories/child/preview", { parent_id: "other" })) })
  expect(screen.getByRole("checkbox", { name: "字段 0" })).toBeChecked()
  await user.click(screen.getByRole("button", { name: "保存" }))
  expect(patch).toHaveBeenCalledWith("/categories/child", expect.objectContaining({ parent_id: "parent", inherited_field_ids: ["f0", "f24"] }))
})
it("preserves an explicit empty draft on preview failure and retries without reloading saved choices", async () => {
  count = 1; saved = ["f0"]
  const user = userEvent.setup(); editor()
  await screen.findByRole("checkbox", { name: "字段 0" }); failPreview = true
  await user.click(screen.getByRole("checkbox", { name: "字段 0" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("预览暂不可用")
  expect(screen.getByRole("checkbox", { name: "字段 0" })).not.toBeChecked()
  expect(screen.getByRole("checkbox", { name: "字段 0" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  failPreview = false; await user.click(screen.getByRole("button", { name: "重试" }))
  await ready(); expect(screen.getByRole("checkbox", { name: "字段 0" })).not.toBeChecked()
  await user.click(screen.getByRole("button", { name: "保存" }))
  expect(patch).toHaveBeenCalledWith("/categories/child", expect.objectContaining({ inherited_field_ids: [] }))
})
it("does not treat failed initialization as an empty selection", async () => {
  failPreview = true; const user = userEvent.setup(); editor()
  expect(await screen.findByRole("alert")).toHaveTextContent("预览暂不可用")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  failPreview = false; await user.click(screen.getByRole("button", { name: "重试" }))
  expect(await screen.findByRole("checkbox", { name: "字段 0" })).toBeChecked()
})
it("offers only final fields for numbering and blocks withdrawals without an authorization token", async () => {
  blockWithdrawal = true
  const user = userEvent.setup(); editor(); await ready()
  await user.click(screen.getByRole("combobox", { name: "用作编号的字段" }))
  expect(await screen.findByRole("option", { name: "自身字段（key999）" })).toBeInTheDocument()
  expect(screen.queryByRole("option", { name: "字段 1（key1）" })).not.toBeInTheDocument()
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("checkbox", { name: "字段 0" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("暂不能保存")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(patch).not.toHaveBeenCalled()
})
it("keeps numbering dependency issues visible until the same draft fixes the number", async () => {
  const user = userEvent.setup(); editor(); await ready()
  await chooseByLabel(user, "用作编号的字段", "字段 0（key0）")
  await ready(); await user.click(screen.getByRole("checkbox", { name: "字段 0" }))
  expect((await screen.findAllByText(/编号字段不在最终字段中/)).length).toBeGreaterThan(0)
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  await chooseByLabel(user, "用作编号的字段", /未设置/)
  await ready()
})
it("disables editing for a reader and explains the missing permission", async () => {
  editor({ permissions: [] })
  const checkbox = await screen.findByRole("checkbox", { name: "字段 0" })
  expect(checkbox).toBeDisabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByRole("alert")).toHaveTextContent("管理类别与字段")
})
it("uses the live English dictionary and supports keyboard selection", async () => {
  applyLang("en"); const user = userEvent.setup(); editor()
  expect(await screen.findByRole("group", { name: "Inherited fields" })).toBeInTheDocument()
  const checkbox = screen.getByRole("checkbox", { name: "字段 1" })
  // Tab through real controls rather than dispatching a synthetic change.
  for (let n = 0; n < 40 && document.activeElement !== checkbox; n++) await user.tab()
  expect(checkbox).toHaveFocus(); await user.keyboard(" ")
  expect(checkbox).toBeChecked()
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled())
})
it("keeps independent impact/issue pages accessible when both require pagination", async () => {
  post.mockImplementation(async (p: string, b: Body) => {
    const data = preview(p, b)
    const url = new URL(p, "http://test")
    return { ...data,
      impact: { ...data.impact, ...page(Array.from({ length: 25 }, (_, i) => ({ category_id: "child", field_id: `impact-${i}`, key: `impact${i}`, change: "added" })), url, "impact") },
      issues: page(Array.from({ length: 25 }, (_, i) => ({ code: "blocked", message: `问题 ${i}`, field_id: `issue-${i}` })), url, "issues"),
    }
  })
  const user = userEvent.setup(); editor()
  const candidates = await screen.findByRole("group", { name: "继承字段" })
  const impact = await screen.findByRole("group", { name: "变更影响" })
  const issues = await screen.findByRole("group", { name: "需要处理的问题" })
  const sizes = screen.getAllByRole("combobox", { name: "每页" })
  expect(new Set(sizes.map((node) => node.id)).size).toBe(3)
  await user.click(within(issues).getByRole("link", { name: "下一页" }))
  expect(await within(issues).findByText("问题 24")).toBeInTheDocument()
  expect(within(impact).getByRole("row", { name: /impact0/ })).toBeInTheDocument()
  expect(within(candidates).getByRole("checkbox", { name: "字段 0" })).toBeChecked()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
})
it("localizes inline field failures and emits failure and success feedback without losing the draft", async () => {
  const user = userEvent.setup()
  renderWithProviders(<><CategoryEditor category={categories[3]} categories={categories} onClose={vi.fn()} /><Toaster /></>)
  await ready()
  patch.mockRejectedValueOnce(new ApiError(400, "validation_failed", "不能保存这个名称", { name: "名称不能重复" }))
  await user.click(screen.getByRole("button", { name: "保存" }))
  expect(await screen.findByText("名称不能重复")).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "名称" })).toHaveAttribute("aria-invalid", "true")
  expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue("子类")
  await waitFor(() => expect(screen.getAllByText("不能保存这个名称").length).toBeGreaterThan(1))
  await ready(); await user.click(screen.getByRole("button", { name: "保存" }))
  expect((await screen.findAllByText("类别已保存")).length).toBeGreaterThan(0)
})
it("refreshes both schema cache prefixes after saving, without putting dialog pages in the URL", async () => {
  function Observer() {
    const a = useQuery({ queryKey: ["schema", "child"], queryFn: () => api.get<{ fields: { label: string }[] }>("/observe-schema") })
    const b = useQuery({ queryKey: ["category-schema", "child"], queryFn: () => api.get<{ fields: { label: string }[] }>("/observe-detail") })
    return <output>{a.data?.fields[0]?.label} {b.data?.fields[0]?.label} {useLocation().search}</output>
  }
  let changed = false
  get.mockImplementation((p: string) => Promise.resolve(p === "/capabilities" ? { printing: false } : { fields: [{ label: changed ? "fresh" : "old" }] }))
  patch.mockImplementation(async () => { changed = true; return {} })
  const user = userEvent.setup()
  renderWithProviders(<><CategoryEditor category={categories[3]} categories={categories} onClose={vi.fn()} /><Observer /></>, { route: "/categories/child?q=keep" })
  await ready(); await user.click(screen.getByRole("link", { name: "下一页" })); await ready()
  await user.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("fresh fresh ?q=keep"))
})
