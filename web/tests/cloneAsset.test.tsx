import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster } from "sonner"

import { NewAssetDialog } from "@/features/assets/NewAssetDialog"
import { ApiError } from "@/lib/api"
import type { BoundField } from "@/lib/types"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"
import { statusRoute } from "./fixtures/statuses"

const navigate = vi.fn()
vi.mock("react-router", async () => ({
  ...await vi.importActual<typeof import("react-router")>("react-router"),
  useNavigate: () => navigate,
}))
const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { get: (p: string) => get(p), post: (p: string, b: unknown) => post(p, b) },
}))

const category = { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "label" }
const field = (key: string, extra: Partial<BoundField> = {}): BoundField => ({
  id: key, key, label: key, type: "text", options: {}, is_unique: false, required: false, sort: 0, ...extra,
})
const fields = [
  field("label"), field("serial", { is_unique: true, required: true }),
  field("missing_unique", { is_unique: true }), field("zero", { type: "number" }),
  field("off", { type: "boolean" }), field("derived", { type: "computed" }),
  field("model_tag", { model_ids: ["m1", "m2"], is_unique: true }),
]
const source = {
  id: "source", display_name: "source-label", category_id: "net", model_id: "m1", status: "retired",
  holder: { type: "user", id: "old" }, owner: { id: "old" }, home_holder: { type: "entity", id: "old-home" },
  home_owner: { id: "old" }, note: "source note", version: 42,
  attrs: { label: "copied", serial: "old-serial", zero: 0, off: false, derived: "old-result", model_tag: "old-tag", obsolete: "hidden" },
  archived_attrs: { archived: "must not return" }, created_at: "2026-01-01", updated_at: "2026-01-02",
}
const holders = [
  { id: "stock", name: "默认仓库", type: "location", is_default_stock: true },
  { id: "other", name: "其他仓库", type: "location", is_default_stock: false },
]
const users = [{ id: "u1", name: "管理员", status: "active" }, { id: "u2", name: "同事", status: "active" }]
const models = [
  { id: "m1", name: "First", vendor_name: "", attr_defaults: { serial: "bad-default", missing_unique: "bad-missing", model_tag: "bad-tag" } },
  { id: "m2", name: "Second", vendor_name: "", attr_defaults: { serial: "bad-default", missing_unique: "bad-missing", model_tag: "bad-tag", new_unique: "bad-new", ordinary: "normal-default" } },
]
function route(p: string): Promise<unknown> {
  const statuses = statusRoute(p)
  if (statuses) return statuses
  if (p === "/assets/source") return Promise.resolve({ asset: source, value_history: [{ field_key: "serial", value: "history" }] })
  if (p === "/categories") return Promise.resolve([category])
  if (p === "/holders") return Promise.resolve(holders)
  if (p === "/users") return Promise.resolve(users)
  if (p === "/models") return Promise.resolve(models)
  if (p.includes("/schema")) return Promise.resolve({ category, fields })
  return Promise.resolve([])
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
function Session() {
  const [open, setOpen] = useState(true)
  const [clone, setClone] = useState<string | undefined>("source")
  return <>
    <button onClick={() => { setClone(undefined); setOpen(true) }}>ordinary</button>
    <button onClick={() => { setClone("source"); setOpen(true) }}>clone again</button>
    <NewAssetDialog open={open} onOpenChange={setOpen} cloneSourceID={clone} />
    <Toaster />
  </>
}
async function ready() {
  expect(await screen.findByRole("textbox", { name: "label" })).toHaveValue("copied")
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({ id: "new-device" })
  navigate.mockReset()
})

describe("single asset clone", () => {
  it("preloads the detail envelope and current model schema, copies only safe attrs, and creates a new identity", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Session />)
    await ready()
    expect(screen.getByRole("dialog", { name: "克隆设备" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /serial/ })).toHaveValue("")
    expect(screen.getByRole("textbox", { name: "missing_unique" })).toHaveValue("")
    expect(screen.getByRole("spinbutton", { name: "zero" })).toHaveValue(0)
    expect(screen.getByRole("checkbox", { name: "off" })).not.toBeChecked()
    expect(screen.queryByRole("textbox", { name: "obsolete" })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("combobox", { name: "设备型号" })).toHaveTextContent("First"))
    expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库")
    expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("默认仓库")
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("source note")
    await user.type(screen.getByRole("textbox", { name: /serial/ }), "new-serial")
    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/assets", {
      category_id: "net", model_id: "m1", status: "in_stock", holder_type: "entity", holder_id: "stock", owner_id: "u1",
      note: "source note", attrs: { label: "copied", serial: "new-serial", missing_unique: null, model_tag: null, zero: 0, off: false },
    }))
    expect(get).toHaveBeenCalledWith("/categories/net/schema?model_id=m1")
    expect(navigate).toHaveBeenCalledWith("/assets/new-device")
    expect(await screen.findByText("已保存")).toBeInTheDocument()
  })

  it("retries failed detail preparation without exposing an empty writable clone", async () => {
    const user = userEvent.setup()
    get.mockImplementation((p: string) => p === "/assets/source" ? Promise.reject(new Error("source unavailable")) : route(p))
    renderWithProviders(<Session />)
    expect(await screen.findByRole("alert")).toHaveTextContent("source unavailable")
    expect(screen.queryByRole("textbox", { name: "备注" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument()
    get.mockImplementation(route)
    await user.click(screen.getByRole("button", { name: "重试" }))
    await ready()
    expect(post).not.toHaveBeenCalled()
  })

  it("retries failed schema preparation instead of treating missing fields as an empty schema", async () => {
    const user = userEvent.setup()
    get.mockImplementation((p: string) => p.includes("/schema") ? Promise.reject(new Error("schema unavailable")) : route(p))
    renderWithProviders(<Session />)
    expect(await screen.findByRole("alert")).toHaveTextContent("schema unavailable")
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument()
    get.mockImplementation(route)
    await user.click(screen.getByRole("button", { name: "重试" }))
    await ready()
  })

  it("cancels a pending preload without writes and ignores its late response in ordinary creation", async () => {
    const user = userEvent.setup()
    const pending = deferred<unknown>()
    get.mockImplementation((p: string) => p === "/assets/source" ? pending.promise : route(p))
    renderWithProviders(<Session />)
    expect(await screen.findByRole("status", { name: "加载中…" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "取消" }))
    await user.click(screen.getByRole("button", { name: "ordinary" }))
    await chooseByLabel(user, "类别", "网络设备")
    await user.type(screen.getByRole("textbox", { name: "备注" }), "manual new note")
    await act(async () => { pending.resolve({ asset: source, value_history: [] }); await pending.promise })
    expect(screen.getByRole("dialog", { name: "录入设备" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("manual new note")
    expect(screen.getByRole("textbox", { name: "label" })).toHaveValue("")
    expect(post).not.toHaveBeenCalled()
  })

  it("starts a fresh read when the same source is reopened while the old read is still pending", async () => {
    const user = userEvent.setup()
    const old = deferred<unknown>()
    let reads = 0
    get.mockImplementation((p: string) => {
      if (p !== "/assets/source") return route(p)
      reads++
      return reads === 1 ? old.promise : Promise.resolve({ asset: { ...source, note: "fresh source" }, value_history: [] })
    })
    renderWithProviders(<Session />)
    await screen.findByRole("status", { name: "加载中…" })
    await user.click(screen.getByRole("button", { name: "取消" }))
    await user.click(screen.getByRole("button", { name: "clone again" }))
    await waitFor(() => expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("fresh source"))
    await user.clear(screen.getByRole("textbox", { name: "备注" }))
    await user.type(screen.getByRole("textbox", { name: "备注" }), "new draft")
    await act(async () => { old.resolve({ asset: source, value_history: [] }); await old.promise })
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("new draft")
    expect(post).not.toHaveBeenCalled()
  })

  it("does not reinitialize edited inputs when source, holders, user, or schema refetch", async () => {
    const user = userEvent.setup()
    const { client } = renderWithProviders(<Session />)
    await ready()
    await user.clear(screen.getByRole("textbox", { name: "label" }))
    await user.type(screen.getByRole("textbox", { name: "label" }), "hand edited")
    await user.clear(screen.getByRole("textbox", { name: "备注" }))
    await user.type(screen.getByRole("textbox", { name: "备注" }), "hand note")
    await chooseByLabel(user, "持有方", "其他仓库")
    await chooseByLabel(user, "负责人", "同事")
    get.mockImplementation((p: string) => p === "/holders" ? Promise.resolve(holders.map((h) => ({ ...h, name: h.name + "更新" }))) : route(p))
    await act(async () => {
      client.setQueryData(["me", "test-token"], { ...users[0], name: "refetched user", is_admin: true })
      await client.invalidateQueries({ queryKey: ["holders"] })
      await client.invalidateQueries({ queryKey: ["asset"] })
      await client.invalidateQueries({ queryKey: ["schema"] })
    })
    expect(screen.getByRole("textbox", { name: "label" })).toHaveValue("hand edited")
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("hand note")
    await waitFor(() => expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("其他仓库更新"))
    expect(screen.getByRole("combobox", { name: "负责人" })).toHaveTextContent("同事")
  })

  it("uses the target model schema to block every unique default, including newly introduced fields", async () => {
    const user = userEvent.setup()
    get.mockImplementation((p: string) => p.endsWith("model_id=m2") ? Promise.resolve({ category, fields: [...fields, field("new_unique", { is_unique: true }), field("ordinary")] }) : route(p))
    renderWithProviders(<Session />)
    await ready()
    await chooseByLabel(user, "设备型号", "Second")
    expect(await screen.findByRole("textbox", { name: "new_unique" })).toHaveValue("")
    expect(screen.getByRole("textbox", { name: /serial/ })).toHaveValue("")
    expect(screen.getByRole("textbox", { name: "model_tag" })).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/assets", expect.objectContaining({
      model_id: "m2", attrs: { label: "copied", serial: null, missing_unique: null, model_tag: null, new_unique: null, zero: 0, off: false },
    })))
  })

  it("drops withdrawn fields and clears copied values that become unique but preserves manual edits", async () => {
    const user = userEvent.setup()
    const { client } = renderWithProviders(<Session />)
    await ready()
    await user.clear(screen.getByRole("spinbutton", { name: "zero" }))
    await user.type(screen.getByRole("spinbutton", { name: "zero" }), "7")
    get.mockImplementation((p: string) => p.includes("/schema") ? Promise.resolve({ category, fields: fields.filter((f) => f.key !== "off").map((f) => ["label", "zero"].includes(f.key) ? { ...f, is_unique: true } : f) }) : route(p))
    await act(async () => { await client.invalidateQueries({ queryKey: ["schema"] }) })
    await waitFor(() => expect(screen.getByRole("textbox", { name: "label" })).toHaveValue(""))
    expect(screen.getByRole("spinbutton", { name: "zero" })).toHaveValue(7)
    expect(screen.queryByRole("checkbox", { name: "off" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/assets", expect.objectContaining({
      attrs: { label: null, serial: null, missing_unique: null, model_tag: null, zero: "7" },
    })))
  })

  it("blocks closing and repeated saves while pending, then locates field errors and retries without losing edits", async () => {
    const user = userEvent.setup()
    const pending = deferred<unknown>()
    post.mockReturnValueOnce(pending.promise)
    renderWithProviders(<Session />)
    await ready()
    await user.type(screen.getByRole("textbox", { name: /serial/ }), "my-serial")
    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    await act(async () => { pending.resolve(Promise.reject(new ApiError(422, "validation", "invalid clone", { serial: "serial is taken" }))); await pending.promise.catch(() => {}) })
    await waitFor(() => expect(screen.getByRole("textbox", { name: /serial/ })).toHaveAttribute("aria-invalid", "true"))
    expect(screen.getByRole("textbox", { name: /serial/ })).toHaveValue("my-serial")
    expect(await screen.findByText("serial is taken")).toBeInTheDocument()
    expect((await screen.findAllByText("invalid clone")).length).toBeGreaterThanOrEqual(2)
    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/assets/new-device"))
  })

  it("starts another clone from current source and never leaks a canceled clone into ordinary creation", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Session />)
    await ready()
    await user.type(screen.getByRole("textbox", { name: /serial/ }), "discard-me")
    await user.click(screen.getByRole("button", { name: "取消" }))
    await user.click(screen.getByRole("button", { name: "clone again" }))
    await ready()
    expect(screen.getByRole("textbox", { name: /serial/ })).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "取消" }))
    await user.click(screen.getByRole("button", { name: "ordinary" }))
    await chooseByLabel(user, "类别", "网络设备")
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("")
    expect(screen.getByRole("textbox", { name: "label" })).toHaveValue("")
    await chooseByLabel(user, "设备型号", "First")
    expect(screen.getByRole("textbox", { name: /serial/ })).toHaveValue("bad-default")
  })
})
