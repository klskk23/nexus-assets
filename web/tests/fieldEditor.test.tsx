import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldEditor } from "@/features/fields/FieldEditor"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"
import type { FieldDefinitionRow } from "@/lib/metaTypes"
import type { FieldType } from "@/lib/types"

const get = vi.fn()
const patch = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: (p: string, b: unknown) => patch(p, b), del: vi.fn() },
  }
})

function field(type: FieldType, over: Partial<FieldDefinitionRow> = {}): FieldDefinitionRow {
  return { id: "f1", key: "k", label: "标签", type, options: {}, is_unique: false, ...over }
}

beforeEach(() => {
  get.mockReset().mockResolvedValue([])
  patch.mockReset().mockResolvedValue({})
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
        field={field("computed", { options: { template: "{{ .attrs.mac | hex2dec }}" } })}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText("计算模板")).toHaveValue("{{ .attrs.mac | hex2dec }}")
  })

  // Retiring an option keeps it visible on existing assets; deleting it would
  // make their stored value unreadable.
  it("retires an enum option instead of deleting it", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <FieldEditor
        field={field("enum", {
          options: { choices: [{ value: "v190", label: "1.9.0" }, { value: "v213", label: "2.1.3" }] },
        })}
        onClose={vi.fn()}
      />,
    )

    const buttons = screen.getAllByRole("button", { name: "废弃" })
    await user.click(buttons[0])
    expect(screen.getByText("已废弃")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/fields/f1",
        expect.objectContaining({
          options: expect.objectContaining({ deprecated: ["v190"] }),
        }),
      ),
    )
    // The choice itself must still be there.
    const [, body] = patch.mock.calls[0]
    expect((body as { options: { choices: unknown[] } }).options.choices).toHaveLength(2)
  })

  it("lists what reads the field before anyone tries to disable it", async () => {
    get.mockResolvedValue([{ kind: "category", id: "rt", label: "SDWAN 路由器" }])
    renderWithProviders(<FieldEditor field={field("mac")} onClose={vi.fn()} />)
    expect(await screen.findByText(/SDWAN 路由器/)).toBeInTheDocument()
  })

  it("surfaces the referrer list when disabling is refused", async () => {
    patch.mockRejectedValue(
      new ApiError(
        409,
        "reference_blocked",
        'field is still referenced: 类别「SDWAN 路由器」的编号生成规则 正在引用「基准 MAC」，请先修改它们',
        undefined,
        [{ kind: "category", id: "rt", label: "SDWAN 路由器" }],
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<FieldEditor field={field("mac", { label: "基准 MAC" })} onClose={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "停用" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("编号生成规则")
    expect(alert).toHaveTextContent("SDWAN 路由器")
  })
})
