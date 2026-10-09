import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { CategoryEditor } from "@/features/categories/CategoryEditor"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"
import type { CategoryDraft } from "@/lib/types"
const post = vi.fn(), patch = vi.fn()
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), api: { get: async () => ({ printing: false }), post: (p: string, b: CategoryDraft) => post(p, b), patch: (p: string, b: CategoryDraft) => patch(p, b) } }))
const category = { id: "child", name: "子类", code: "C", path: "/root/child/", parent_id: "root", display_key: "input", print_preset_ids: [] }
const fields = [{ id: "a", key: "input", label: "输入字段", type: "text" as const, options: {}, is_unique: false }, { id: "z", key: "computed", label: "计算字段", type: "computed" as const, options: { template: "attrs.input" }, is_unique: false }]
let descendant = false
beforeEach(() => {
  descendant = false; patch.mockReset().mockResolvedValue({})
  post.mockReset().mockImplementation(async (_p, b: CategoryDraft) => {
    const selected = b.inherited_field_ids ?? ["a", "z"]
    const final = fields.filter((f) => selected.includes(f.id))
    const issues = []
    if (b.display_key && !final.some((f) => f.key === b.display_key)) issues.push({ code: "display_key_unbound", message: "编号字段必须有效", category_id: descendant ? "descendant" : "child", field_key: b.display_key, field_id: "a" })
    if (selected.includes("z") && !selected.includes("a")) issues.push({ code: "computed_dependency_missing", message: "计算字段缺少输入字段", category_id: "child", field_id: "z", field_key: "computed" })
    return { category: { ...category, ...b }, inheritance: { parent_id: "root", selected_field_ids: selected, candidates: { items: fields.map((field) => ({ field, source_category_id: "root", selected: selected.includes(field.id) })), total: 2, offset: 0, limit: 20 } }, fields: final, impact: { items: [], total: 0, offset: 0, limit: 20, added_count: 0, removed_count: 0, source_changed_count: 0, category_count: 0, asset_count: 0 }, issues: { items: issues, total: issues.length, offset: 0, limit: 20 }, requires_confirmation: false, confirmation_token: "" }
  })
})
function editor() { renderWithProviders(<CategoryEditor category={category} categories={[category]} onClose={vi.fn()} />) }
it("locates current numbering issues at the editable numbering control and clears them after repair", async () => {
  const user = userEvent.setup(); editor()
  await user.click(await screen.findByRole("checkbox", { name: "输入字段" }))
  await waitFor(() => expect(screen.getByRole("combobox", { name: /用作编号的字段/ })).toHaveAttribute("aria-invalid", "true"))
  expect(screen.getByRole("combobox", { name: /用作编号的字段/ })).toBeEnabled()
  await chooseByLabel(user, "用作编号的字段", /未设置/)
  await user.click(screen.getByRole("checkbox", { name: "计算字段" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled())
  expect(screen.getByRole("combobox", { name: /用作编号的字段/ })).not.toHaveAttribute("aria-invalid", "true")
  await user.click(screen.getByRole("button", { name: "保存" }))
  expect(patch).toHaveBeenCalledWith("/categories/child", expect.objectContaining({ display_key: "", inherited_field_ids: [] }))
})
it("links descendant issues by UUID without auto-changing their numbering or the current draft", async () => {
  descendant = true; const user = userEvent.setup(); editor()
  await user.click(await screen.findByRole("checkbox", { name: "输入字段" }))
  expect(await screen.findByRole("link", { name: "descendant" })).toHaveAttribute("href", "/categories/descendant")
  expect(screen.getByRole("combobox", { name: /用作编号的字段/ })).not.toHaveAttribute("aria-invalid", "true")
  expect(screen.getByRole("checkbox", { name: "输入字段" })).not.toBeChecked()
  expect(screen.getByRole("checkbox", { name: "计算字段" })).toBeChecked()
  expect(patch).not.toHaveBeenCalled()
})
