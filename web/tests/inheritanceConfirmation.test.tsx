import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { CategoryEditor } from "@/features/categories/CategoryEditor"
import { FieldEditor } from "@/features/fields/FieldEditor"
import { Toaster } from "@/components/ui/sonner"
import { ApiError } from "@/lib/api"
import { applyLang } from "@/i18n"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { Category, CategoryDraft, CategoryPreview } from "@/lib/types"

const post = vi.fn(), patch = vi.fn(), get = vi.fn(), del = vi.fn()
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), api: { post: (p: string, b: unknown) => post(p, b), patch: (p: string, b: unknown) => patch(p, b), get: (p: string) => get(p), del: (p: string, b: unknown) => del(p, b) } }))
const categories: Category[] = [{ id: "root", name: "父类", code: "R", path: "/root/", parent_id: null, display_key: "" }, { id: "child", name: "子类", code: "C", path: "/root/child/", parent_id: "root", display_key: "", print_preset_ids: [] }]
const field = { id: "f", key: "code", label: "继承编号", type: "text" as const, options: {}, required: false, is_unique: false, sort: 0, category_ids: ["root"], model_ids: [], vendor_ids: [] }
let token = "token-1"
function preview(path: string, body: Partial<CategoryDraft> = {}): CategoryPreview {
  const url = new URL(path, "http://test")
  const selected = body.inherited_field_ids ?? ["f"]
  const removed = path.includes("unbind-preview") || !selected.includes("f")
  const offset = Number(url.searchParams.get("impact_offset") ?? 0)
  const limit = Number(url.searchParams.get("impact_limit") ?? 20)
  return { category: { ...categories[1], ...body }, inheritance: { parent_id: "root", selected_field_ids: selected, candidates: { items: [{ field, source_category_id: "root", selected: selected.includes("f") }], total: 1, offset: 0, limit: 20 } }, fields: selected.includes("f") ? [field] : [], impact: { items: removed ? Array.from({ length: 25 }, (_, i) => ({ category_id: "child", field_id: `f${i}`, key: `removed_${i}`, change: "removed" as const })).slice(offset, offset + limit) : [], total: removed ? 25 : 0, offset, limit, added_count: 0, removed_count: removed ? 25 : 0, source_changed_count: 0, category_count: removed ? 2 : 0, asset_count: removed ? 7 : 0 }, issues: { items: [], total: 0, offset: 0, limit: 20 }, requires_confirmation: removed, confirmation_token: removed ? `${token}-${body.name ?? "子类"}` : "" }
}
beforeEach(() => {
  applyLang("zh"); token = "token-1"
  post.mockReset().mockImplementation(async (p, b) => preview(p, b))
  patch.mockReset().mockResolvedValue({}); del.mockReset().mockResolvedValue({})
  get.mockReset().mockImplementation(async (p) => p === "/categories" ? categories : p === "/capabilities" ? { printing: false } : p.endsWith("/asset-count") ? { count: 7 } : [])
})
function editor() { return renderWithProviders(<><CategoryEditor category={categories[1]} categories={categories} onClose={vi.fn()} /><Toaster /></>) }
async function withdrawal() { const user = userEvent.setup(); editor(); await user.click(await screen.findByRole("checkbox", { name: "继承编号" })); await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()); await user.click(screen.getByRole("button", { name: "保存" })); return user }

it("previews full withdrawal impact, freezes the draft, pages details and cancels without writing", async () => {
  const user = await withdrawal(); const dialog = await screen.findByRole("alertdialog")
  expect(dialog).toHaveTextContent("影响 2 个类别、7 台设备")
  expect(screen.getByRole("textbox", { name: "名称", hidden: true })).toBeDisabled()
  await user.click(within(dialog).getByRole("link", { name: "下一页" }))
  expect(await within(dialog).findByText("removed_24")).toBeInTheDocument()
  await user.click(within(dialog).getByRole("button", { name: "取消" }))
  expect(screen.getByRole("checkbox", { name: "继承编号" })).not.toBeChecked()
  expect(patch).not.toHaveBeenCalled()
})
it("invalidates confirmation after editing any draft member and submits the newly reviewed complete draft", async () => {
  const user = await withdrawal()
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "取消" }))
  await user.clear(screen.getByRole("textbox", { name: "名称" })); await user.type(screen.getByRole("textbox", { name: "名称" }), "新名称")
  await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()); await user.click(screen.getByRole("button", { name: "保存" }))
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认保存" }))
  await waitFor(() => expect(patch).toHaveBeenCalledWith("/categories/child", { name: "新名称", parent_id: "root", display_key: "", inherited_field_ids: [], print_preset_ids: [], confirmation_token: "token-1-新名称" }))
  expect(await screen.findByText("类别已保存")).toBeInTheDocument()
})
it("keeps failed stale drafts and never replays a write after refreshing the preview", async () => {
  patch.mockRejectedValueOnce(new ApiError(409, "impact_stale", "影响已变化"))
  const user = await withdrawal(); await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认保存" }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  expect(screen.getByRole("checkbox", { name: "继承编号" })).not.toBeChecked()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  token = "token-2"; await user.click(screen.getByRole("button", { name: "刷新预览" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled())
  expect(patch).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole("button", { name: "保存" })); expect(patch).toHaveBeenCalledTimes(1)
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认保存" }))
  await waitFor(() => expect(patch).toHaveBeenLastCalledWith("/categories/child", expect.objectContaining({ confirmation_token: "token-2-子类" })))
})
it("keeps the confirmation open and disables dismissal while the write is pending", async () => {
  let finish!: () => void; patch.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  const user = await withdrawal(); const dialog = screen.getByRole("alertdialog")
  await user.click(within(dialog).getByRole("button", { name: "确认保存" }))
  expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled()
  expect(within(dialog).getByRole("button", { name: /保存中/ })).toBeDisabled()
  await user.keyboard("{Escape}"); expect(dialog).toBeInTheDocument(); await act(async () => finish())
})
it("renders conflict objects as UUID links and blocks saving without mutating the draft", async () => {
  post.mockImplementation(async (p, b) => ({ ...preview(p, b), issues: { items: [{ code: "unique_conflict", message: "恢复冲突", category_id: "child", field_id: "f", field_key: "code", asset_id: "asset-uuid", conflict_asset_id: "conflict-uuid" }], total: 1, offset: 0, limit: 20 } }))
  editor()
  expect(await screen.findByRole("link", { name: "asset-uuid" })).toHaveAttribute("href", "/assets/asset-uuid")
  expect(screen.getByRole("link", { name: "conflict-uuid" })).toHaveAttribute("href", "/assets/conflict-uuid")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
})
it("disables every field write for readers and explains the missing permission", async () => {
  renderWithProviders(<FieldEditor field={field} onClose={vi.fn()} />, { permissions: [] })
  expect(await screen.findByRole("checkbox", { name: "父类" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "删除字段" })).toBeDisabled()
  expect(screen.getByRole("alert")).toHaveTextContent("管理类别与字段")
})
it("requires a fresh preview and a separate confirmation after stale unbinding", async () => {
  del.mockRejectedValueOnce(new ApiError(409, "impact_stale", "影响已变化"))
  const user = userEvent.setup(); renderWithProviders(<FieldEditor field={field} onClose={vi.fn()} />)
  await user.click(await screen.findByRole("checkbox", { name: "父类" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "解绑" })).toBeEnabled())
  await user.click(screen.getByRole("button", { name: "解绑" }))
  expect(await within(screen.getByRole("alertdialog")).findByText("影响已变化")).toBeInTheDocument()
  token = "token-2"; await user.click(screen.getByRole("button", { name: "刷新预览" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "解绑" })).toBeEnabled())
  expect(del).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole("button", { name: "解绑" }))
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "父类" })).not.toBeChecked())
  expect(del).toHaveBeenLastCalledWith("/categories/root/bindings/f", { confirmation_token: "token-2-子类" })
})
it("previews category unbinding, preserves the checked binding on cancellation and sends a token on confirmation", async () => {
  const user = userEvent.setup(); renderWithProviders(<FieldEditor field={field} onClose={vi.fn()} />)
  await user.click(await screen.findByRole("checkbox", { name: "父类" }))
  const dialog = await screen.findByRole("alertdialog")
  expect(await within(dialog).findByText("影响 2 个类别、7 台设备")).toBeInTheDocument()
  await user.click(within(dialog).getByRole("button", { name: "取消" })); expect(screen.getByRole("checkbox", { name: "父类" })).toBeChecked(); expect(del).not.toHaveBeenCalled()
  await user.click(screen.getByRole("checkbox", { name: "父类" })); await waitFor(() => expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "解绑" })).toBeEnabled())
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "解绑" }))
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "父类" })).not.toBeChecked())
  expect(del).toHaveBeenCalledWith("/categories/root/bindings/f", { confirmation_token: "token-1-子类" })
})
