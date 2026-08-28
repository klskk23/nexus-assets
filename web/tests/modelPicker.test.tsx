import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ModelPicker } from "@/features/assets/ModelPicker"
import { renderWithProviders } from "@/test/renderWithProviders"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "rt", code: "RT", name: "路由器", parent_id: "net", path: "/net/rt/", display_key: "sn" },
  { id: "sw", code: "SW", name: "交换机", parent_id: "net", path: "/net/sw/", display_key: "" },
]

const models = [
  { id: "m1", category_id: "rt", name: "X100", vendor: "Acme", attr_defaults: { firmware: "3.0.0", ports: "8" } },
  { id: "m2", category_id: "net", name: "通用机", vendor: "", attr_defaults: {} },
  { id: "m3", category_id: "sw", name: "S24", vendor: "Acme", attr_defaults: {} },
  { id: "m4", category_id: "rt", name: "旧款", vendor: "", attr_defaults: {}, archived_at: "2026-01-01T00:00:00Z" },
]

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) =>
    p === "/categories" ? Promise.resolve(categories) : Promise.resolve(models),
  )
})

describe("ModelPicker", () => {
  // A model from a sibling branch has nothing to do with this device; offering
  // it only invites a mis-selection.
  it("offers the category chain's models and nothing from a sibling branch", async () => {
    renderWithProviders(
      <ModelPicker categoryID="rt" value={null} values={{}} onChange={vi.fn()} />,
    )
    // Wait for the model list itself, not just the control that holds it.
    await screen.findByRole("option", { name: "Acme X100" })
    const select = screen.getByLabelText("设备型号")
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent)

    expect(labels).toContain("Acme X100")
    expect(labels).toContain("通用机")
    expect(labels).not.toContain("Acme S24")
    // Archived models are not choices either.
    expect(labels.some((l) => l?.includes("旧款"))).toBe(false)
  })

  it("fills only the blanks when recording a new asset", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ModelPicker
        categoryID="rt"
        value={null}
        values={{ firmware: "2.1.3" }}
        onChange={onChange}
      />,
    )
    await screen.findByRole("option", { name: "Acme X100" })
    await user.selectOptions(screen.getByLabelText("设备型号"), "m1")

    // firmware was already typed, so it survives; ports was blank, so it fills.
    expect(onChange).toHaveBeenCalledWith("m1", { ports: "8" })
  })

  // The system does not record whether a value was typed by hand or came from a
  // model, so it must not guess -- it asks.
  it("asks before overwriting values when changing the model of an existing asset", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ModelPicker
        categoryID="rt"
        value={null}
        values={{ firmware: "2.1.3" }}
        confirmOverwrite
        onChange={onChange}
      />,
    )
    await screen.findByRole("option", { name: "Acme X100" })
    await user.selectOptions(screen.getByLabelText("设备型号"), "m1")

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("firmware: 2.1.3 → 3.0.0")).toBeInTheDocument()
    expect(within(dialog).getByText("ports: — → 8")).toBeInTheDocument()
    // Nothing is applied while the question is still open.
    expect(onChange).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole("button", { name: "套用并覆盖" }))
    expect(onChange).toHaveBeenCalledWith("m1", { firmware: "3.0.0", ports: "8" })
  })

  it("changes the model without touching the values when told to keep them", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ModelPicker
        categoryID="rt"
        value={null}
        values={{ firmware: "2.1.3" }}
        confirmOverwrite
        onChange={onChange}
      />,
    )
    await screen.findByRole("option", { name: "Acme X100" })
    await user.selectOptions(screen.getByLabelText("设备型号"), "m1")

    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "仅换型号，保留现值" }))
    expect(onChange).toHaveBeenCalledWith("m1", {})
  })

  it("does not ask when the new model carries no defaults", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ModelPicker categoryID="rt" value={null} values={{}} confirmOverwrite onChange={onChange} />,
    )
    await screen.findByRole("option", { name: "通用机" })
    await user.selectOptions(screen.getByLabelText("设备型号"), "m2")

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith("m2", {})
  })
})
