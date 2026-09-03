import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AssetDetail } from "@/routes/AssetDetail"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { choose } from "@/test/choose"
import { ApiError } from "@/lib/api"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: "a1" }) }
})

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: (p: string) => del(p),
    },
  }
})

const asset = {
  id: "a1",
  display_name: "112394521950",
  category_id: "net",
  model_id: null,
  status: "in_stock",
  owner: { id: "u1", name: "管理员" },
  holder: { type: "entity", id: "loc", name: "上海仓库" },
  attrs: { mac: "001A2B3C4D5E", firmware: "2.1.3" },
  note: "屏幕左下角有划痕",
  archived_attrs: { legacy_note: "旧备注" },
  version: 3,
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
}

const schema = {
  category: { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "sn" },
  fields: [
    { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 10 },
    { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false, required: false, sort: 20 },
  ],
}

const models = [
  { id: "m1", category_id: "net", name: "X100", vendor: "Acme", attr_defaults: { firmware: "3.0.0" } },
]

function route(p: string) {
  const st = statusRoute(p)
  if (st) return st

  if (p === "/assets/a1") {
    return Promise.resolve({
      asset,
      value_history: [{ key: "sn", value: "112394521949", archived_at: "2026-08-01T00:00:00Z" }],
    })
  }
  if (p.endsWith("/schema")) return Promise.resolve(schema)
  if (p === "/categories") return Promise.resolve([schema.category])
  if (p === "/models") return Promise.resolve(models)
  if (p === "/users") {
    return Promise.resolve([
      { id: "u2", email: "z@example.com", name: "张三", auth_type: "local", status: "active" },
    ])
  }
  if (p === "/holders") {
    return Promise.resolve([
      { id: "loc", type: "location", name: "上海仓库", parent_id: null, is_default_stock: true },
    ])
  }
  return Promise.resolve([])
}

describe("AssetDetail", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation(route)
    post.mockReset().mockResolvedValue({ batch_id: null, transfers: [{ id: "t1" }] })
    patch.mockReset()
    del.mockReset()
  })

  it("shows the number, status and any retired values", async () => {
    renderWithProviders(<AssetDetail />)
    expect(await screen.findByText("112394521950")).toBeInTheDocument()
    expect(await screen.findByText("在库")).toBeInTheDocument()
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

  // A built-in beside category, status, holder and owner: it belongs to the
  // device rather than to any category's schema, so it is on every device
  // whatever fields its category has.
  it("shows the note and saves an edited one", async () => {
    patch.mockResolvedValue({ ...asset, note: "已送修", version: 4 })
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    const note = screen.getByLabelText("备注")
    expect(note).toHaveValue("屏幕左下角有划痕")

    await user.clear(note)
    await user.type(note, "已送修")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/assets/a1", expect.objectContaining({ note: "已送修" })),
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

    await user.click(screen.getByRole("button", { name: "编辑设备属性" }))
    await user.click(screen.getByRole("button", { name: "保存" }))
    const alerts = await screen.findAllByRole("alert")
    expect(alerts.map((a) => a.textContent)).toContain("MAC 格式非法")
  })

  it("announces the new number when correcting the MAC changes it", async () => {
    patch.mockResolvedValue({ ...asset, display_name: "112394521951", version: 4 })
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(await screen.findByRole("status")).toHaveTextContent(
      "编号 112394521950 已变更为 112394521951",
    )
  })

  // The five operations are the point of the dialog, so they are a row of
  // toggles rather than a dropdown: all of them readable at a glance, and one
  // click to choose instead of two.
  it("shows every transfer operation without opening anything", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    const dialog = screen.getByRole("dialog")
    for (const label of ["签出", "归还", "转移", "改负责人", "改状态"]) {
      expect(within(dialog).getByRole("radio", { name: label })).toBeInTheDocument()
    }

    // Choosing one marks it pressed, so the current choice is visible too.
    await user.click(within(dialog).getByRole("radio", { name: "转移" }))
    expect(within(dialog).getByRole("radio", { name: "转移" })).toHaveAttribute(
      "data-state",
      "on",
    )
  })

  // The gap that sent us here: an asset could be recorded and then never moved
  // or have its status changed, because the only transfer controls lived on the
  // list page behind a multi-select.
  it("can hand the device over from the detail page", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    const dialog = screen.getByRole("dialog")

    await user.click(within(dialog).getByRole("radio", { name: "签出" }))
    await choose(user, await within(dialog).findByRole("combobox", { name: "账号" }), "张三")
    await user.type(within(dialog).getByLabelText("本次流转的备注"), "借给张三")
    await user.click(within(dialog).getByRole("button", { name: "提交" }))

    // A single device is just a one-element batch, through the same endpoint
    // the list page uses.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "借给张三",
        to_status: "in_use",
        to_holder_type: "user",
        to_holder_id: "u2",
      }),
    )
  })

  it("changes the status without leaving the page", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    const dialog = screen.getByRole("dialog")
    await user.click(within(dialog).getByRole("radio", { name: "改状态" }))
    await choose(user, within(dialog).getByRole("combobox", { name: "状态" }), "维修中")
    await user.click(within(dialog).getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "",
        to_status: "in_repair",
      }),
    )
  })

  // The form stays on screen after a move, so a submitted choice left selected
  // would be one stray click away from recording the same move twice.
  it("clears the chosen operation once the move is recorded", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    const dialog = screen.getByRole("dialog")
    await user.click(within(dialog).getByRole("radio", { name: "改状态" }))
    await user.click(within(dialog).getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(within(dialog).getByRole("radio", { name: "改状态" })).toHaveAttribute(
        "data-state",
        "off",
      ),
    )
    // And with nothing chosen, submitting again is not possible.
    expect(within(dialog).getByRole("button", { name: "提交" })).toBeDisabled()
  })

  // Deleting is irreversible, so it goes through a dialog that stays inert
  // until the number is typed out.
  it("requires the number to be typed before it will delete", async () => {
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
    await waitFor(() => expect(del).toHaveBeenCalledWith("/assets/a1?confirm=112394521950"))
  })
})

// Two pairs of controls said "持有方" and "负责人": the state the device is in
// now, and where it goes when it is returned. Read one for the other and Save
// looks like it reassigns a colleague.
it("keeps where it is now apart from where it belongs", async () => {
  renderWithProviders(<AssetDetail />)
  await screen.findByText("112394521950")

  const dialog = screen.getByRole("dialog")
  // The current pair is stated, not editable: it moves through a transfer.
  expect(within(dialog).getByText("当前持有方")).toBeInTheDocument()
  expect(within(dialog).getByText(/用下面的流转/)).toBeInTheDocument()
  expect(within(dialog).queryByLabelText("持有方")).not.toBeInTheDocument()

  // The editable pair is behind the details button, and says which one it is
  // in its own label once opened.
  const user = userEvent.setup()
  await user.click(within(dialog).getByRole("button", { name: "编辑设备属性" }))
  expect(within(dialog).getByLabelText("默认持有方")).toBeInTheDocument()
  expect(within(dialog).getByLabelText("默认负责人")).toBeInTheDocument()
})

// A device opens over the list rather than instead of it, and closing puts it
// away without losing where the list was (decision 89).
it("opens as a dialog over the list and closes back to it", async () => {
  const user = userEvent.setup()
  renderWithProviders(<AssetDetail />)
  await screen.findByText("112394521950")

  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByText("112394521950")).toBeInTheDocument()

  await user.click(within(dialog).getByRole("button", { name: /关闭|Close/ }))
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({ pathname: "/assets", search: "" }),
  )
})

// The dialog shows the last few movements; the rest is a page, because forty
// events in a box is a page inside a box.
it("links to the full history when there is more than it shows", async () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    id: `t${i}`,
    asset_id: "a1",
    batch_id: null,
    kind: "transfer",
    from_status: "in_stock",
    from_holder: { type: "entity", id: "loc", name: "上海仓库" },
    from_owner_id: null,
    to_status: "in_stock",
    to_holder: { type: "entity", id: "loc", name: "上海仓库" },
    to_owner_id: "u1",
    due_at: null,
    created_at: "2026-08-28T00:00:00Z",
    edited_at: null,
    edited_by: null,
  }))
  get.mockImplementation((p: string) =>
    p === "/assets/a1/transfers" ? Promise.resolve(events) : route(p),
  )
  renderWithProviders(<AssetDetail />)
  await screen.findByText("112394521950")

  const link = await screen.findByRole("link", { name: /查看全部流转/ })
  expect(link).toHaveAttribute("href", "/assets/a1/history")
})
