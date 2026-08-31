import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DisplayKeyEditor } from "@/features/categories/DisplayKeyEditor"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"
import type { BoundField } from "@/lib/types"

const post = vi.fn()
const patch = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: vi.fn().mockResolvedValue([]),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: vi.fn(),
    },
  }
})

const fields = [
  { id: "f1", key: "sn", label: "设备编号", type: "computed", options: {}, is_unique: true, required: false, sort: 10 },
  { id: "f2", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 20 },
  { id: "f3", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false, required: false, sort: 30 },
] as unknown as BoundField[]

function render(over: Partial<Parameters<typeof DisplayKeyEditor>[0]> = {}) {
  return renderWithProviders(
    <DisplayKeyEditor
      categoryID="rt"
      displayKey="sn"
      fields={fields}
      {...over}
    />,
  )
}

beforeEach(() => {
  post.mockReset()
  patch.mockReset().mockResolvedValue({})
})

describe("DisplayKeyEditor", () => {
  // A number two devices can share is not an identifier, so a non-unique field
  // must not even be offered.
  it("offers only the unique fields as the display key", async () => {
    const user = userEvent.setup()
    render()
    // The listbox exists only while it is open, so the options are read there.
    await user.click(screen.getByRole("combobox", { name: "用作编号的字段" }))
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent)

    expect(labels).toContain("设备编号（sn）")
    expect(labels).toContain("基准 MAC（mac）")
    expect(labels.some((l) => l?.includes("固件版本"))).toBe(false)
    expect(labels).toContain("未设置（显示 UUID 前 8 位）")
  })

  // Picking the number to show is a display choice; it must not renumber
  // anything by itself. What recomputes is a changed expression, saved in the
  // field editor.
  it("saves the choice without touching a single asset", async () => {
    const user = userEvent.setup()
    render()

    await chooseByLabel(user, "用作编号的字段", "基准 MAC（mac）")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/categories/rt", { display_key: "mac" }),
    )
    // Saving must not recompute anything on its own.
    expect(post).not.toHaveBeenCalled()
  })
})
