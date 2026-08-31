import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldEditor } from "@/features/fields/FieldEditor"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"
import type { FieldDefinitionRow } from "@/lib/metaTypes"
import type { FieldType } from "@/lib/types"

const get = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn(),
      patch: (p: string, b: unknown) => patch(p, b),
      del: (p: string) => del(p),
    },
  }
})

function field(type: FieldType, over: Partial<FieldDefinitionRow> = {}): FieldDefinitionRow {
  return { id: "f1", key: "k", label: "标签", type, options: {}, is_unique: false, ...over }
}

beforeEach(() => {
  get.mockReset().mockResolvedValue([])
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
