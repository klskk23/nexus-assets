import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AssetDetail } from "@/routes/AssetDetail"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: "a1" }) }
})

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

const asset = {
  id: "a1",
  sn: "112394521950",
  category_id: "net",
  model_id: null,
  status: "in_stock",
  owner: { id: "u1", name: "管理员" },
  holder: { type: "entity", id: "loc", name: "上海仓库" },
  attrs: { mac: "001A2B3C4D5E", firmware: "2.1.3" },
  archived_attrs: { legacy_note: "旧备注" },
  version: 3,
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
}

const schema = {
  category: { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", sn_template: "" },
  sn_template: "{{ .attrs.mac | hex2dec }}",
  sn_template_from: "net",
  fields: [
    { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 10 },
    { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false, required: false, sort: 20 },
  ],
}

function route(p: string) {
  if (p === "/assets/a1") return Promise.resolve({ asset, sn_history: ["112394521949"] })
  if (p.endsWith("/schema")) return Promise.resolve(schema)
  return Promise.resolve([])
}

describe("AssetDetail", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation(route)
    patch.mockReset()
    del.mockReset()
  })

  it("shows the serial number, status and any retired numbers", async () => {
    renderWithProviders(<AssetDetail />)
    expect(await screen.findByText("112394521950")).toBeInTheDocument()
    expect(screen.getByText("在库")).toBeInTheDocument()
    expect(screen.getByText(/112394521949/)).toBeInTheDocument()
  })

  it("keeps values of fields that left the category, marked as archived", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await user.click(await screen.findByRole("button", { name: /已归档字段/ }))
    expect(await screen.findByText("legacy_note")).toBeInTheDocument()
    expect(screen.getByText("旧备注")).toBeInTheDocument()
  })

  it("sends the version it read so a concurrent edit is detected", async () => {
    patch.mockResolvedValue({ ...asset, version: 4 })
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/assets/a1", expect.objectContaining({ version: 3 })),
    )
  })

  it("tells the user to reload when someone else got there first", async () => {
    patch.mockRejectedValue(
      new ApiError(409, "version_conflict", "他人已修改这条记录，请刷新后重试"),
    )
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(await screen.findByRole("status")).toHaveTextContent("他人已修改这条记录，请刷新后重试")
  })

  it("puts a field-level save error next to its input", async () => {
    patch.mockRejectedValue(
      new ApiError(422, "validation_failed", "保存失败", { mac: "MAC 格式非法" }),
    )
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    await user.click(screen.getByRole("button", { name: "保存" }))
    const alerts = await screen.findAllByRole("alert")
    expect(alerts.map((a) => a.textContent)).toContain("MAC 格式非法")
  })

  it("announces the new number when correcting the MAC changes it", async () => {
    patch.mockResolvedValue({ ...asset, sn: "112394521951", version: 4 })
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(await screen.findByRole("status")).toHaveTextContent(
      "编号 112394521950 已变更为 112394521951",
    )
  })

  // Deleting is irreversible, so it goes through a dialog that stays inert
  // until the serial number is typed out.
  it("requires the serial number to be typed before it will delete", async () => {
    del.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    await user.click(screen.getByRole("button", { name: "删除" }))
    const dialog = await screen.findByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()

    const input = screen.getByLabelText(/请输入/)
    await user.type(input, "112394521949")
    expect(confirm).toBeDisabled()

    await user.clear(input)
    await user.type(input, "112394521950")
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    await waitFor(() => expect(del).toHaveBeenCalledWith("/assets/a1?confirm_sn=112394521950"))
  })
})
