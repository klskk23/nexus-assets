import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ModelPicker } from "@/features/assets/ModelPicker"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"

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
  { id: "m1", name: "X100", vendor_name: "Acme", attr_defaults: { firmware: "3.0.0", ports: "8" } },
  { id: "m2", name: "通用机", vendor_name: "", attr_defaults: {} },
  { id: "m3", name: "S24", vendor_name: "Acme", attr_defaults: {} },
  { id: "m4", name: "旧款", vendor_name: "", attr_defaults: {}, archived_at: "2026-01-01T00:00:00Z" },
  { id: "m5", name: "两用机", vendor_name: "Acme", attr_defaults: {} },
]

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) =>
    p === "/categories" ? Promise.resolve(categories) : Promise.resolve(models),
  )
})

describe("ModelPicker", () => {
  /**
   * Every model, in one order.
   *
   * The association used to filter this list -- a model from a sibling branch
   * was withheld -- which is what made a device silently lose its model's
   * fields when the two disagreed. 026 turned it into an ordering, and 029
   * removed the association itself: a model comes from a vendor and belongs to
   * no category, so there is no nearer half of the list to float to the top.
   *
   * Archived models stay out, which is a different question and unchanged.
   */
  it("offers every model, in name order, and no archived ones", async () => {
    renderWithProviders(
      <ModelPicker value={null} values={{}} onChange={vi.fn()} />,
    )
    // The listbox exists only while it is open, so the options are read there.
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "设备型号" }))
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent)

    expect(labels).toContain("Acme X100")
    expect(labels).toContain("通用机")
    expect(labels).toContain("Acme 两用机")
    expect(labels).toContain("Acme S24")
    // One order for all of them, and it is the name.
    expect(labels.indexOf("Acme S24")).toBeLessThan(labels.indexOf("Acme X100"))
    // Archived models are not choices either.
    expect(labels.some((l) => l?.includes("旧款"))).toBe(false)
  })

  it("fills only the blanks when recording a new asset", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ModelPicker
        value={null}
        values={{ firmware: "2.1.3" }}
        onChange={onChange}
      />,
    )
    await chooseByLabel(user, "设备型号", "Acme X100")

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
        value={null}
        values={{ firmware: "2.1.3" }}
        confirmOverwrite
        onChange={onChange}
      />,
    )
    await chooseByLabel(user, "设备型号", "Acme X100")

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
        value={null}
        values={{ firmware: "2.1.3" }}
        confirmOverwrite
        onChange={onChange}
      />,
    )
    await chooseByLabel(user, "设备型号", "Acme X100")

    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "仅换型号，保留现值" }))
    expect(onChange).toHaveBeenCalledWith("m1", {})
  })

  it("does not ask when the new model carries no defaults", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ModelPicker value={null} values={{}} confirmOverwrite onChange={onChange} />,
    )
    await chooseByLabel(user, "设备型号", "通用机")

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith("m2", {})
  })
})

// The "ModelPicker ordering" block stood here, with two tests about which way
// the association reached: a model attached to a child sorted after this
// category's own, and a model attached to two branches appeared under both.
// 029 removed the association, so both are describing a rule that no longer
// exists -- what remains of them is the assertion above that every model is
// offered, whatever the category.
