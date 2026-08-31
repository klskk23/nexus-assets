import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldEditor } from "@/features/fields/FieldEditor"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"
import { chooseFromMenu } from "@/test/menu"
import type { FieldDefinitionRow } from "@/lib/metaTypes"
import type { FieldType } from "@/lib/types"

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: (p: string) => del(p),
    },
  }
})

function field(type: FieldType, over: Partial<FieldDefinitionRow> = {}): FieldDefinitionRow {
  return { id: "f1", key: "k", label: "标签", type, options: {}, is_unique: false, ...over }
}

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "srv", code: "SRV", name: "服务器", parent_id: null, path: "/srv/", display_key: "" },
]

/** Answers the queries the editor makes; referrers stay empty by default. */
function route(p: string) {
  if (p === "/categories") return Promise.resolve(categories)
  if (p.startsWith("/assets")) return Promise.resolve({ items: [], total: 4, offset: 0, limit: 1 })
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({ affected: 0, total: 0, conflicts: [], applied: true, samples: [] })
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

describe("FieldEditor", () => {
  it("shows only the controls that belong to the field's type", async () => {
    const { unmount } = renderWithProviders(
      <FieldEditor field={field("text")} onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText("校验正则")).toBeInTheDocument()
    expect(screen.queryByLabelText("最小值")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("计算模板")).not.toBeInTheDocument()
    unmount()

    renderWithProviders(<FieldEditor field={field("number")} onClose={vi.fn()} />)
    expect(screen.getByLabelText("最小值")).toBeInTheDocument()
    expect(screen.getByLabelText("单位")).toBeInTheDocument()
    expect(screen.queryByLabelText("校验正则")).not.toBeInTheDocument()
  })

  // Saving a changed rule and recomputing what it governs used to be two
  // buttons on two pages, which is how assets ended up on rules nobody had
  // applied to them.
  it("recomputes what the rule governs when the rule is saved", async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ affected: 12, total: 40, conflicts: [], applied: true, samples: [] })
    const onClose = vi.fn()
    renderWithProviders(
      <FieldEditor
        field={field("computed", { options: { template: "hex2dec(attrs.mac)" } })}
        onClose={onClose}
      />,
    )

    await user.clear(screen.getByLabelText("表达式"))
    await user.type(screen.getByLabelText("表达式"), "attrs.mac")
    await user.click(screen.getByRole("button", { name: "保存" }))

    // The save waits on the answer rather than happening behind the question.
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "保存并重算" }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/fields/f1", {
        label: "标签",
        options: { template: "attrs.mac" },
      }),
    )
    expect(post).toHaveBeenCalledWith("/fields/f1/recompute?dry_run=false", {})
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("saves nothing when the recompute is declined", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <FieldEditor
        field={field("computed", { options: { template: "hex2dec(attrs.mac)" } })}
        onClose={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText("表达式"), " + \"x\"")
    await user.click(screen.getByRole("button", { name: "保存" }))
    await user.click(await screen.findByRole("button", { name: "取消" }))

    expect(patch).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  // Half the fleet on the new rule and half on the old is the state this whole
  // flow exists to prevent, so a collision undoes the rule as well.
  it("puts the rule back when the recompute would collide", async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({
      affected: 3,
      total: 3,
      conflicts: [{ key: "sn", value: "RT", assets: ["112394521950", "112394521951"] }],
      applied: false,
      samples: [],
    })
    const onClose = vi.fn()
    renderWithProviders(
      <FieldEditor
        field={field("computed", { options: { template: "hex2dec(attrs.mac)" } })}
        onClose={onClose}
      />,
    )

    await user.clear(screen.getByLabelText("表达式"))
    await user.type(screen.getByLabelText("表达式"), "category.code")
    await user.click(screen.getByRole("button", { name: "保存" }))
    await user.click(await screen.findByRole("button", { name: "保存并重算" }))

    await waitFor(() =>
      expect(patch).toHaveBeenLastCalledWith("/fields/f1", {
        options: { template: "hex2dec(attrs.mac)" },
      }),
    )
    expect(screen.getByText(/已放弃保存/)).toBeInTheDocument()
    expect(screen.getByText("sn = RT：112394521950、112394521951")).toBeInTheDocument()
    // The dialog stays open on the rule that was refused, not on a blank page.
    expect(onClose).not.toHaveBeenCalled()
  })

  // Renaming a computed field changes no stored value, so it must not drag a
  // fleet-wide recompute behind it.
  it("asks nothing when only the label changed", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <FieldEditor
        field={field("computed", { options: { template: "hex2dec(attrs.mac)" } })}
        onClose={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText("显示名"), "2")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(post).not.toHaveBeenCalled()
  })

  it("offers a template box for a computed field", () => {
    renderWithProviders(
      <FieldEditor
        field={field("computed", { options: { template: "hex2dec(attrs.mac)" } })}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText("表达式")).toHaveValue("hex2dec(attrs.mac)")
  })

  it("lists what reads the field before anyone tries to remove it", async () => {
    get.mockResolvedValue([{ kind: "field", id: "sn", label: "设备编号" }])
    renderWithProviders(<FieldEditor field={field("mac")} onClose={vi.fn()} />)
    expect(await screen.findByText(/设备编号/)).toBeInTheDocument()
  })

  // Configuration standing in the way: the fix is to edit that configuration,
  // so the refusal names it.
  it("surfaces the referrer list when deletion is refused by configuration", async () => {
    del.mockRejectedValue(
      new ApiError(
        409,
        "reference_blocked",
        "表达式键「设备编号」正在引用「基准 MAC」，请先修改它们",
        undefined,
        [{ kind: "field", id: "sn", label: "设备编号" }],
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<FieldEditor field={field("mac", { label: "基准 MAC" })} onClose={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "删除字段" }))
    const dialog = await screen.findByRole("alertdialog")
    // Deleting an item is irreversible, so it asks for the key first -- the
    // same bar every other destructive action in the app sets.
    await user.type(within(dialog).getByRole("textbox"), "k")
    await user.click(within(dialog).getByRole("button", { name: "删除字段" }))

    const alerts = await screen.findAllByRole("alert")
    const text = alerts.map((a) => a.textContent).join(" ")
    expect(text).toContain("表达式键")
    expect(text).toContain("设备编号")
  })

  // Data standing in the way: editing configuration will not help, so the
  // refusal names the devices and points at unbinding instead.
  it("lists the blocking devices when assets still carry a value", async () => {
    del.mockRejectedValue(
      new ApiError(
        409,
        "reference_blocked",
        "仍有 2 台设备填写了「基准 MAC」。要下线它，请改为从类别上解绑",
        undefined,
        undefined,
        [
          { asset_id: "a1", name: "112394521950" },
          { asset_id: "a2", name: "112394521951" },
        ],
        2,
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<FieldEditor field={field("mac", { label: "基准 MAC" })} onClose={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "删除字段" }))
    const dialog = await screen.findByRole("alertdialog")
    // Deleting an item is irreversible, so it asks for the key first -- the
    // same bar every other destructive action in the app sets.
    await user.type(within(dialog).getByRole("textbox"), "k")
    await user.click(within(dialog).getByRole("button", { name: "删除字段" }))

    const alerts = await screen.findAllByRole("alert")
    const text = alerts.map((a) => a.textContent).join(" ")
    expect(text).toContain("112394521950")
    expect(text).toContain("112394521951")
    expect(text).toContain("解绑")
  })

  it("deletes the field when nothing stands in the way", async () => {
    del.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <FieldEditor field={field("text", { id: "spare", label: "备用" })} onClose={onClose} />,
    )

    await user.click(screen.getByRole("button", { name: "删除字段" }))
    const dialog = await screen.findByRole("alertdialog")
    // Deleting an item is irreversible, so it asks for the key first -- the
    // same bar every other destructive action in the app sets.
    await user.type(within(dialog).getByRole("textbox"), "k")
    await user.click(within(dialog).getByRole("button", { name: "删除字段" }))

    await waitFor(() => expect(del).toHaveBeenCalledWith("/fields/spare"))
    expect(onClose).toHaveBeenCalled()
  })
})

// A field belongs to categories, not the other way round: this is where that
// is decided, so the page that owns the field owns the binding.
describe("FieldEditor bindings", () => {
  it("binds the field to a category and lists it", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <FieldEditor field={field("text")} onClose={vi.fn()} />,
    )

    expect(await screen.findByText(/还没有绑定到任何类别/)).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "绑定字段" }))
    await user.click(await screen.findByRole("option", { name: "网络设备" }))
    await user.click(screen.getByRole("button", { name: "绑定字段" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/categories/net/bindings", {
        field_id: "f1",
        required: false,
      }),
    )
    expect(await screen.findByRole("row", { name: "网络设备" })).toBeInTheDocument()
  })

  it("warns before making it required where devices already exist", async () => {
    const user = userEvent.setup()
    renderWithProviders(<FieldEditor field={field("text")} onClose={vi.fn()} />)

    await user.click(screen.getByRole("combobox", { name: "绑定字段" }))
    await user.click(await screen.findByRole("option", { name: "网络设备" }))
    await user.click(screen.getByLabelText("必填"))

    expect(await screen.findByText(/已有 4 台设备/)).toBeInTheDocument()
  })

  it("unbinds from the row menu, after confirming", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <FieldEditor field={field("text", { category_ids: ["net"] })} onClose={vi.fn()} />,
    )

    const row = await screen.findByRole("row", { name: "网络设备" })
    await chooseFromMenu(user, row, "解绑")
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "解绑" }))

    await waitFor(() => expect(del).toHaveBeenCalledWith("/categories/net/bindings/f1"))
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: "网络设备" })).not.toBeInTheDocument(),
    )
  })

  // The refusal has to land in the dialog: the page behind it is covered.
  it("shows a refused binding inside the dialog", async () => {
    post.mockRejectedValue(
      new ApiError(409, "unique_conflict", "键名 rack 已经绑定在「服务器」上"),
    )
    const user = userEvent.setup()
    renderWithProviders(<FieldEditor field={field("text")} onClose={vi.fn()} />)

    await user.click(screen.getByRole("combobox", { name: "绑定字段" }))
    await user.click(await screen.findByRole("option", { name: "服务器" }))
    await user.click(screen.getByRole("button", { name: "绑定字段" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("已经绑定在")
  })
})
