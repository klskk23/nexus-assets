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
  { id: "m1", category_ids: ["rt"], name: "X100", vendor_name: "Acme", attr_defaults: { firmware: "3.0.0", ports: "8" } },
  { id: "m2", category_ids: ["net"], name: "通用机", vendor_name: "", attr_defaults: {} },
  { id: "m3", category_ids: ["sw"], name: "S24", vendor_name: "Acme", attr_defaults: {} },
  { id: "m4", category_ids: ["rt"], name: "旧款", vendor_name: "", attr_defaults: {}, archived_at: "2026-01-01T00:00:00Z" },
  // Serves two unrelated branches at once -- the thing a single category_id
  // could not express without entering the same device twice.
  { id: "m5", category_ids: ["rt", "sw"], name: "两用机", vendor_name: "Acme", attr_defaults: {} },
]

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) =>
    p === "/categories" ? Promise.resolve(categories) : Promise.resolve(models),
  )
})

describe("ModelPicker", () => {
  /**
   * Every model, with this category's first.
   *
   * The association used to filter the list -- a model from a sibling branch
   * was withheld -- and 026 turned it into an ordering instead. Filtering was
   * what made a device silently lose its model's fields when the two
   * disagreed, and the association was never a fact about the model anyway: a
   * model comes from a vendor.
   *
   * Archived models stay out, which is a different question and unchanged.
   */
  it("offers every model, this category's first, and no archived ones", async () => {
    renderWithProviders(
      <ModelPicker categoryID="rt" value={null} values={{}} onChange={vi.fn()} />,
    )
    // The listbox exists only while it is open, so the options are read there.
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "设备型号" }))
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent)

    expect(labels).toContain("Acme X100")
    expect(labels).toContain("通用机")
    expect(labels).toContain("Acme 两用机")
    // The sibling branch's model is offered now, and last.
    expect(labels).toContain("Acme S24")
    expect(labels.indexOf("Acme S24")).toBeGreaterThan(labels.indexOf("Acme X100"))
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
        categoryID="rt"
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
        categoryID="rt"
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
      <ModelPicker categoryID="rt" value={null} values={{}} confirmOverwrite onChange={onChange} />,
    )
    await chooseByLabel(user, "设备型号", "通用机")

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith("m2", {})
  })
})

// The association orders the list; it no longer decides what is in it (026).
//
// Which direction it reaches is therefore a question about ordering rather than
// about availability: a model attached to a child is not "this category's", so
// it sorts after the ones that are -- but it is still offered, because the
// person choosing it knows something the association does not.
describe("ModelPicker ordering", () => {
  it("puts a child category's model after this category's own", async () => {
    renderWithProviders(
      <ModelPicker categoryID="net" value={null} values={{}} onChange={vi.fn()} />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "设备型号" }))
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent)

    expect(labels).toContain("通用机")
    expect(labels).toContain("Acme X100")
    expect(labels.indexOf("Acme X100")).toBeGreaterThan(labels.indexOf("通用机"))
  })

  it("offers a model associated with several categories under each of them", async () => {
    for (const cat of ["rt", "sw"]) {
      const view = renderWithProviders(
        <ModelPicker categoryID={cat} value={null} values={{}} onChange={vi.fn()} />,
      )
      const user = userEvent.setup()
      await user.click(screen.getByRole("combobox", { name: "设备型号" }))
      await screen.findByRole("option", { name: "Acme 两用机" })
      await user.keyboard("{Escape}")
      view.unmount()
    }
  })
})
