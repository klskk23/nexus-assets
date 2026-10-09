import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useQuery } from "@tanstack/react-query"
import { beforeEach, expect, it, vi } from "vitest"
import { FieldEditor } from "@/features/fields/FieldEditor"
import { api } from "@/lib/api"
import { renderWithProviders } from "@/test/renderWithProviders"

const get = vi.fn(), post = vi.fn()
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), api: { get: (p: string) => get(p), post: (p: string, b: unknown) => post(p, b), patch: vi.fn(), del: vi.fn() } }))
const field = { id: "f", key: "purchase", label: "采购日期", type: "text" as const, options: {}, is_unique: false, category_ids: ["root", "child"], model_ids: [], vendor_ids: [] }
const categories = [{ id: "root", name: "父类", path: "/root/", parent_id: null }, { id: "child", name: "子类", path: "/root/child/", parent_id: "root" }, { id: "new", name: "新类", path: "/new/", parent_id: null }]
let changed = false
beforeEach(() => {
  changed = false
  get.mockReset().mockImplementation(async (p) => p === "/categories" ? categories : p === "/fields/f/asset-count" ? { count: changed ? 9 : 7 } : p.startsWith("/assets?") ? { total: 99 } : p.startsWith("/observe/") ? { value: changed ? "新字段集" : "旧字段集" } : [])
  post.mockReset().mockImplementation(async () => { changed = true; return {} })
})
it("shows one deduplicated required count instead of summing overlapping ancestor bindings", async () => {
  const user = userEvent.setup(); renderWithProviders(<FieldEditor field={field} onClose={vi.fn()} />)
  await user.click(screen.getByRole("checkbox", { name: "必填" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("7")
  expect(screen.getByRole("alert")).not.toHaveTextContent("198")
})
it("counts vendor-only fields even when they have no direct model binding", async () => {
  const user = userEvent.setup(); renderWithProviders(<FieldEditor field={{ ...field, category_ids: [], vendor_ids: ["v"] }} onClose={vi.fn()} />)
  await user.click(screen.getByRole("checkbox", { name: "必填" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("7")
})
it("does not disguise a failed required-impact count as zero devices", async () => {
  get.mockImplementation(async (p) => { if (p === "/fields/f/asset-count") throw new Error("offline"); return p === "/categories" ? categories : [] })
  const user = userEvent.setup(); renderWithProviders(<FieldEditor field={field} onClose={vi.fn()} />)
  await user.click(screen.getByRole("checkbox", { name: "必填" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("出错了")
})
it("refetches every effective-schema consumer and field count after binding with a real QueryClient", async () => {
  function Consumers() {
    const keys = ["category-schema", "asset", "assets", "referrers", "field-asset-count", "schema", "fields", "category-counts", "overview"]
    return <>{keys.map((key) => <Consumer key={key} query={key} />)}</>
  }
  function Consumer({ query }: { query: string }) {
    const data = useQuery({ queryKey: [query, "observer"], queryFn: () => api.get<{ value: string }>(`/observe/${query}`) })
    return <output aria-label={query}>{data.data?.value}</output>
  }
  const user = userEvent.setup(); renderWithProviders(<><FieldEditor field={field} onClose={vi.fn()} /><Consumers /></>)
  await waitFor(() => expect(screen.getAllByText("旧字段集")).toHaveLength(9))
  await user.click(await screen.findByRole("checkbox", { name: "新类" }))
  await waitFor(() => expect(screen.getAllByText("新字段集")).toHaveLength(9))
  expect(screen.getByRole("checkbox", { name: "新类" })).toBeChecked()
})
