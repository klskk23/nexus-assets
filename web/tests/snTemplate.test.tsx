import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SnTemplateEditor } from "@/features/categories/SnTemplateEditor"
import { renderWithProviders } from "@/test/renderWithProviders"

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

function render(over: Partial<Parameters<typeof SnTemplateEditor>[0]> = {}) {
  return renderWithProviders(
    <SnTemplateEditor
      categoryID="rt"
      categoryName="SDWAN 路由器"
      template="{{ .attrs.mac | hex2dec }}"
      {...over}
    />,
  )
}

beforeEach(() => {
  post.mockReset()
  patch.mockReset().mockResolvedValue({})
})

describe("SnTemplateEditor", () => {
  it("keeps saving the rule separate from renumbering existing devices", async () => {
    const user = userEvent.setup()
    render()

    await user.clear(screen.getByLabelText("模板"))
    await user.type(screen.getByLabelText("模板"), "{{{{ .id }}}}")
    await user.click(screen.getByRole("button", { name: "保存规则" }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/categories/rt", expect.any(Object)))
    // Saving must not renumber anything on its own.
    expect(post).not.toHaveBeenCalled()
    expect(await screen.findByRole("status")).toHaveTextContent("只影响之后新建的资产")
  })

  it("previews the blast radius before anything can be applied", async () => {
    post.mockResolvedValue({
      affected: 1847,
      total: 2000,
      conflicts: [],
      applied: false,
      samples: [{ from: "112394521950", to: "RT-112394521950" }],
    })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量编号" }))

    const preview = await screen.findByRole("region", { name: "重算预览" })
    expect(within(preview).getByText("将影响 1847 台（该子树共 2000 台）")).toBeInTheDocument()
    expect(within(preview).getByText("112394521950 → RT-112394521950")).toBeInTheDocument()
    // The dry run must have asked for a dry run.
    expect(post).toHaveBeenCalledWith("/categories/rt/recompute-sn?dry_run=true", {})
  })

  it("blocks the apply button while the preview shows conflicts", async () => {
    post.mockResolvedValue({
      affected: 3,
      total: 3,
      conflicts: [{ sn: "12345", assets: ["112394521950", "112394521951"] }],
      applied: false,
      samples: [],
    })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量编号" }))
    expect(await screen.findByText("发现 1 处编号冲突")).toBeInTheDocument()
    expect(screen.getByText("12345 ← 112394521950、112394521951")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认重算" })).toBeDisabled()
  })

  it("applies only after the preview came back clean", async () => {
    post
      .mockResolvedValueOnce({ affected: 3, total: 3, conflicts: [], applied: false, samples: [] })
      .mockResolvedValueOnce({ affected: 3, total: 3, conflicts: [], applied: true, samples: [] })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量编号" }))
    const apply = await screen.findByRole("button", { name: "确认重算" })
    expect(apply).toBeEnabled()

    await user.click(apply)
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith("/categories/rt/recompute-sn?dry_run=false", {}),
    )
    expect(await screen.findByRole("status")).toHaveTextContent("已重算 3 台，旧编号已归档")
  })

  it("says so when nothing would change", async () => {
    post.mockResolvedValue({ affected: 0, total: 12, conflicts: [], applied: false, samples: [] })
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole("button", { name: "重算存量编号" }))
    expect(await screen.findByText("没有资产的编号会变化")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认重算" })).toBeDisabled()
  })

  it("shows where an inherited rule comes from", () => {
    render({ inheritedFromName: "网络设备" })
    expect(screen.getByText("继承自「网络设备」")).toBeInTheDocument()
  })
})
