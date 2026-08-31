import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DynamicForm } from "@/features/assets/DynamicForm"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { BoundField, FieldType } from "@/lib/types"

function field(key: string, type: FieldType, extra: Partial<BoundField> = {}): BoundField {
  return {
    id: `f-${key}`,
    key,
    label: key,
    type,
    options: {},
    is_unique: false,
    required: false,
    sort: 0,
    ...extra,
  }
}

const allTypes: BoundField[] = [
  field("mac", "mac", { label: "基准 MAC", required: true, is_unique: true }),
  field("firmware", "text", { label: "固件版本" }),
  field("ports", "number", { label: "端口数" }),
  field("managed", "boolean", { label: "纳管" }),
  field("bought_on", "date", { label: "采购日期" }),
  field("mgmt_ip", "ip", { label: "管理 IP" }),
  field("doc", "url", { label: "文档" }),
  field("sn_calc", "computed", { label: "推导编号", options: { template: "{{ .attrs.mac | hex2dec }}" } }),
]

/** By key rather than by index: the list of types is not stable. */
function byKey(key: string): BoundField {
  const f = allTypes.find((x) => x.key === key)
  if (!f) throw new Error(`no fixture field ${key}`)
  return f
}

describe("DynamicForm", () => {
  it("renders a labelled control for every one of the eight field types", () => {
    renderWithProviders(<DynamicForm fields={allTypes} values={{}} onChange={vi.fn()} />)

    for (const f of allTypes) {
      // Every control must be reachable by its visible label, which is also what
      // makes it reachable for a keyboard or screen reader.
      expect(screen.getByLabelText(new RegExp(f.label))).toBeInTheDocument()
    }
  })

  it("marks required fields and flags inherited and unique ones", () => {
    renderWithProviders(
      <DynamicForm
        fields={[field("mac", "mac", { label: "基准 MAC", required: true, is_unique: true, inherited_from: "net" })]}
        values={{}}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText("继承")).toBeInTheDocument()
    expect(screen.getByText("唯一")).toBeInTheDocument()
  })

  it("puts each server error next to its own input", () => {
    renderWithProviders(
      <DynamicForm
        fields={allTypes}
        values={{}}
        errors={{ mac: "MAC 格式非法", firmware: "此字段必填" }}
        onChange={vi.fn()}
      />,
    )
    const alerts = screen.getAllByRole("alert").map((n) => n.textContent)
    expect(alerts).toContain("MAC 格式非法")
    expect(alerts).toContain("此字段必填")

    // The message must be wired to the input, not merely nearby.
    const macInput = screen.getByLabelText(/基准 MAC/)
    expect(macInput).toHaveAttribute("aria-describedby", "field-mac-error")
  })

  it("reports edits through onChange", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<DynamicForm fields={[allTypes[1]]} values={{}} onChange={onChange} />)

    await user.type(screen.getByLabelText(/固件版本/), "2")
    expect(onChange).toHaveBeenCalledWith("firmware", "2")
  })

  it("makes a computed field read-only", () => {
    renderWithProviders(
      <DynamicForm fields={[byKey("sn_calc")]} values={{ sn_calc: "112394521950" }} onChange={vi.fn()} />,
    )
    const input = screen.getByLabelText(/推导编号/)
    expect(input).toHaveAttribute("readonly")
    expect(input).toBeDisabled()
  })
})
