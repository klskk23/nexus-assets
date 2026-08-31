import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
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
      categoryName="SDWAN 路由器"
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

  it("keeps saving the choice separate from recomputing existing devices", async () => {
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

  it("previews the blast radius before anything can be applied", async () => {
    post.mockResolvedValue({
      affected: 1847,
      total: 2000,
      conflicts: [],
      applied: false,
      samples: [{ asset: "112394521950", key: "sn", from: "112394521950", to: "RT-112394521950" }],
    })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量数据" }))

    const preview = await screen.findByRole("region", { name: "重算预览" })
    expect(within(preview).getByText("将影响 1847 台（该子树共 2000 台）")).toBeInTheDocument()
    expect(
      within(preview).getByText("112394521950：sn 112394521950 → RT-112394521950"),
    ).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith("/categories/rt/recompute?dry_run=true", {})
  })

  it("blocks the apply button while the preview shows conflicts", async () => {
    post.mockResolvedValue({
      affected: 3,
      total: 3,
      conflicts: [{ key: "sn", value: "12345", assets: ["112394521950", "112394521951"] }],
      applied: false,
      samples: [],
    })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量数据" }))
    expect(await screen.findByText("发现 1 处取值冲突")).toBeInTheDocument()
    expect(
      screen.getByText("sn = 12345 ← 112394521950、112394521951"),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认重算" })).toBeDisabled()
  })

  it("applies only after the preview came back clean", async () => {
    post
      .mockResolvedValueOnce({ affected: 3, total: 3, conflicts: [], applied: false, samples: [] })
      .mockResolvedValueOnce({ affected: 3, total: 3, conflicts: [], applied: true, samples: [] })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量数据" }))
    const apply = await screen.findByRole("button", { name: "确认重算" })
    expect(apply).toBeEnabled()

    await user.click(apply)
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith("/categories/rt/recompute?dry_run=false", {}),
    )
    expect(await screen.findByRole("status")).toHaveTextContent("已重算 3 台，旧取值已归档")
  })

  it("says so when nothing would change", async () => {
    post.mockResolvedValue({ affected: 0, total: 12, conflicts: [], applied: false, samples: [] })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量数据" }))
    expect(await screen.findByText("没有资产的取值会变化")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认重算" })).toBeDisabled()
  })
})
