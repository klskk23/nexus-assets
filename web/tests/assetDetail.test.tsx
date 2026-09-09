import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AssetDetail } from "@/routes/AssetDetail"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { choose } from "@/test/choose"
import { ApiError } from "@/lib/api"
import { t, tTransfer } from "@/i18n"

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

/**
 * 022 的续篇：编辑与流转都从页面上搬进了对话框，页面只剩「这台设备是什么」。
 * 所以凡是要碰表单的测试，先得把对应的对话框打开 —— 这两个助手就是那一步，
 * 写成函数是为了下次再搬时只改一处。
 */
async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: t.assets.editAttrs }))
  return screen.findByRole("dialog")
}
async function openTransfer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: tTransfer.actions.title }))
  return screen.findByRole("dialog")
}

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
  { id: "m1", category_id: "net", name: "X100", vendor_name: "Acme", attr_defaults: { firmware: "3.0.0" } },
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
  if (p.includes("/schema")) return Promise.resolve(schema)
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

/**
 * The device's own note, on the page rather than only in the form that edits
 * it. "螺丝滑牙，拆机小心" is written for whoever opens this page next, and
 * until now the only way to read it was to open the editor -- which is the
 * shape 015 decision 104 removed everywhere else on this page.
 */
describe("AssetDetail", () => {
  it("显示这台设备自己的备注", async () => {
    renderWithProviders(<AssetDetail />)
    expect(await screen.findByText("屏幕左下角有划痕")).toBeInTheDocument()
  })

  /**
   * 默认归属有两半，属性带只写了地点那一半。
   *
   * 默认负责人决定这台设备归还之后责任落到谁头上（`destination()` 会把它一起
   * 带过去），而它在下面的表单里可改、在页面上不可见 —— 被一个看不见的设置
   * 指派了责任的人，没有任何办法知道自己被指派了。
   */
  it("默认归属把负责人也写出来", async () => {
    get.mockImplementation((p: string) =>
      p === "/assets/a1"
        ? Promise.resolve({
            asset: {
              ...asset,
              home_holder: { type: "entity", id: "loc", name: "上海仓库" },
              home_owner: { id: "u2", name: "张三" },
            },
            value_history: [],
          })
        : route(p),
    )
    renderWithProviders(<AssetDetail />)

    // 当前持有方也是上海仓库，所以按名字找会命中两处 —— 要的是归属那一格。
    expect(await screen.findByText("默认负责人：张三")).toBeInTheDocument()
    const home = screen.getByText("默认归属").closest("div")!
    expect(within(home).getByText("上海仓库")).toBeInTheDocument()
  })

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

  // On the page, not behind a fold. The value is the reason the device shows
  // a field its category no longer has -- hiding the reason while showing the
  // oddity is the wrong way round.
  it("keeps values of fields that left the category, marked as archived", async () => {
    renderWithProviders(<AssetDetail />)
    expect(await screen.findByText("legacy_note")).toBeInTheDocument()
    expect(screen.getByText("旧备注")).toBeInTheDocument()
  })

  it("sends the version it read so a concurrent edit is detected", async () => {
    patch.mockResolvedValue({ ...asset, version: 4 })
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    await openEdit(user)

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
    await openEdit(user)

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
    await openEdit(user)

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
    await openEdit(user)

    await user.click(screen.getByRole("button", { name: "保存" }))
    const alerts = await screen.findAllByRole("alert")
    expect(alerts.map((a) => a.textContent)).toContain("MAC 格式非法")
  })

  it("announces the new number when correcting the MAC changes it", async () => {
    patch.mockResolvedValue({ ...asset, display_name: "112394521951", version: 4 })
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    await openEdit(user)

    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(await screen.findByRole("status")).toHaveTextContent(
      "编号 112394521950 已变更为 112394521951",
    )
  })

  // The five operations are the point of this card, so they are a row of
  // toggles rather than a dropdown: all of them readable at a glance, and one
  // click to choose instead of two.
  it("shows every transfer operation without opening anything", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    await openTransfer(user)

    for (const label of ["签出", "归还", "转移", "改负责人", "改状态"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument()
    }

    // Choosing one marks it pressed, so the current choice is visible too.
    await user.click(screen.getByRole("radio", { name: "转移" }))
    expect(screen.getByRole("radio", { name: "转移" })).toHaveAttribute(
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
    await openTransfer(user)


    await user.click(screen.getByRole("radio", { name: "签出" }))
    await choose(user, await screen.findByRole("combobox", { name: "账号" }), "张三")
    await user.type(screen.getByLabelText("本次流转的备注"), "借给张三")
    await user.click(screen.getByRole("button", { name: "提交" }))

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
    await openTransfer(user)

    await user.click(screen.getByRole("radio", { name: "改状态" }))
    await choose(user, screen.getByRole("combobox", { name: "状态" }), "维修中")
    await user.click(screen.getByRole("button", { name: "提交" }))

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
  // The form used to sit on the page and reset itself after a move. It is a
  // dialog now, so the equivalent -- and the better answer -- is that it goes
  // away: the device behind it already shows the new state and the new event.
  it("closes once the move is recorded", async () => {
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    await openTransfer(user)

    await user.click(screen.getByRole("radio", { name: "改状态" }))
    await user.click(screen.getByRole("button", { name: "提交" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  // Deleting is irreversible, so it goes through a dialog that stays inert
  // until the number is typed out.
  it("requires the number to be typed before it will delete", async () => {
    del.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    await openEdit(user)

    await user.click(screen.getByRole("button", { name: "删除" }))
    await screen.findByRole("alertdialog")
    const confirm = screen.getByRole("button", { name: "删除" })
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
  // Explicit: this sits outside the describe that resets the api mock.
  get.mockReset().mockImplementation(route)
  renderWithProviders(<AssetDetail />)
  await screen.findByText("112394521950")

  // A page now, not a dialog: queries run against the document.
  // The current pair is stated, not editable: it moves through the form
  // below, which is what the card it sits in is for.
  expect(screen.getByText("当前持有方")).toBeInTheDocument()
  expect(screen.queryByLabelText("持有方")).not.toBeInTheDocument()

  // The editable pair is behind the details button, and says which one it is
  // in its own label once opened.
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "编辑设备属性" }))
  await screen.findByRole("dialog")
  expect(await screen.findByLabelText("默认持有方")).toBeInTheDocument()
  expect(screen.getByLabelText("默认负责人")).toBeInTheDocument()
})

// A device opens over the list rather than instead of it, and closing puts it
// away without losing where the list was (decision 89).
// 022 replaced the dialog with a page. What has to survive that is the list's
// filter: the dialog kept it because the list stayed mounted behind it, and a
// page cannot rely on that. It rides on this page's own query string instead,
// which is why the back link is asserted as an href rather than a call --
// an href survives a refresh, and a remembered value would not.
it("goes back to the list, carrying the filter it arrived with", async () => {
  renderWithProviders(<AssetDetail />, {
    route: "/assets/a1?status=in_stock&q=1123&offset=40",
  })
  await screen.findByText("112394521950")

  const back = screen.getByRole("link", { name: t.assets.title })
  expect(back).toHaveAttribute("href", "/assets?status=in_stock&q=1123&offset=40")
})

// The three entrances that carry nothing -- a scan that hit exactly one device,
// finishing the entry form, the audit's "just this object" -- land on a bare
// address. Back then goes to the unfiltered list, which is right: they did not
// come from a filter, so there is none to hand back.
it("goes back to the plain list when it was opened without one", async () => {
  renderWithProviders(<AssetDetail />, { route: "/assets/a1" })
  await screen.findByText("112394521950")

  expect(screen.getByRole("link", { name: t.assets.title })).toHaveAttribute(
    "href",
    "/assets",
  )
})

// The dialog showed the last five and sent you to another page for the rest.
// A page has room, so it shows all of them and that second page is gone.
it("shows every movement, with nowhere else to go for the rest", async () => {
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

  // Six events, six rows -- the slice to five is what this asserts is gone.
  // A table now, so the rows are rows: the header counts as one, hence +1.
  const table = await screen.findByRole("table")
  expect(within(table).getAllByRole("row")).toHaveLength(7)

  // And no way out to a longer version of the same thing.
  expect(
    screen.queryByRole("link", { name: /全部流转|full history/i }),
  ).not.toBeInTheDocument()
})

// The mock put a sentence under the title explaining how the number is
// derived. That sentence belongs to the entry form -- it tells somebody
// deciding whether to type one -- and says nothing to somebody reading a
// device that already has one. What replaced it is the two fields you would
// otherwise scroll to the attributes card to find.
describe("标题下面那一行", () => {
  it("有型号有厂商时，写型号 · 厂商", async () => {
    get.mockImplementation((p: string) =>
      p === "/assets/a1"
        ? Promise.resolve({ asset: { ...asset, model_id: "m1" }, value_history: [] })
        : route(p),
    )
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    expect(await screen.findByText("X100 · Acme")).toBeInTheDocument()
  })

  // The fixture device has no model, so the line has nothing to say and does
  // not appear -- rather than appearing with a separator and nothing round it.
  it("没有型号时整行不出现", async () => {
    // Set explicitly: this describe sits outside the beforeEach that resets
    // the api mock, so without this it inherits the previous test's device.
    get.mockReset().mockImplementation(route)
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    expect(screen.queryByText(/X100|Acme/)).not.toBeInTheDocument()
  })

  it("不解释编号是怎么来的", async () => {
    get.mockReset().mockImplementation(route)
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    expect(screen.queryByText(/推导/)).not.toBeInTheDocument()
  })
})

// The correction window closes as soon as the device moves again, so only the
// last event can be corrected. These three moved here from editEvent.test.tsx
// when 023 turned the timeline into a table: a table may not put a control in
// a cell -- it fires with the row, and one click gives two results -- so the
// correction is a right-click item.
describe("更正一条流转", () => {
  const ev = (id: string, at: string) => ({
    id,
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
    created_at: at,
    edited_at: null,
    edited_by: null,
  })

  async function rows() {
    get.mockReset().mockImplementation((p: string) =>
      p === "/assets/a1/transfers"
        ? Promise.resolve([ev("old", "2026-08-01T00:00:00Z"), ev("newest", "2026-08-28T00:00:00Z")])
        : route(p),
    )
    const user = userEvent.setup()
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")
    const table = await screen.findByRole("table")
    return { user, rows: within(table).getAllByRole("row") }
  }

  it("最后一条可以更正", async () => {
    const { user, rows: r } = await rows()
    // Header is row 0; the tail is the last one.
    await user.pointer({ keys: "[MouseRight>]", target: r[r.length - 1] })
    const menu = await screen.findByRole("menu")
    // Radix marks a menu item with aria-disabled rather than the HTML
    // attribute, so that is what "enabled" means here.
    expect(within(menu).getByRole("menuitem", { name: /修改这条记录/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })

  // Disabled, not absent: somebody who cannot use it can still learn it exists.
  it("其余各条的菜单项禁用而不是消失", async () => {
    const { user, rows: r } = await rows()
    await user.pointer({ keys: "[MouseRight>]", target: r[1] })
    const menu = await screen.findByRole("menu")
    expect(within(menu).getByRole("menuitem", { name: /修改这条记录/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })
})

// Deleting used to be a section of its own at the bottom of the dialog, which
// gave the rarest thing on the screen a heading of its own.
it("keeps delete beside save rather than in a section of its own", async () => {
  const user = userEvent.setup()
  renderWithProviders(<AssetDetail />)
  await screen.findByText("112394521950")
  await openEdit(user)

  // A page now, not a dialog: queries run against the document.
  expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument()
  // The card the two of them share is the device's own, not a delete card.
  expect(screen.queryByText("删除资产")).not.toBeInTheDocument()

  // Both live in the editor, so Save is reachable from the same place --
  // which is the whole of what "beside" was protecting.
  expect(screen.getByRole("button", { name: t.assets.save })).toBeInTheDocument()
})

// A label for the one device on screen used to be two clicks and a page away
// -- close this dialog, tick the row, open the list's own print dialog. The
// header carries the same button the list page does.
// This test and the one after it sit outside describe("AssetDetail")'s own
// beforeEach, so each has to put the mocks back itself rather than lean on
// whatever the previous test in the file left behind.
it("prints this device from the header", async () => {
  get.mockReset().mockImplementation((p: string) =>
    p === "/capabilities"
      ? Promise.resolve({ printing: true, printing_url: "http://printer:3000" })
      : route(p),
  )
  post.mockReset().mockImplementation((p: string, body: { dry_run?: boolean }) =>
    p === "/print" && body?.dry_run
      ? Promise.resolve({
          batches: [
            {
              category_id: "net",
              category_name: "网络设备",
              count: 1,
              numbers: ["112394521950"],
            },
          ],
        })
      : Promise.resolve({ batch_id: null, transfers: [{ id: "t1" }] }),
  )

  const user = userEvent.setup()
  renderWithProviders(<AssetDetail />)
  await screen.findByText("112394521950")

  // A page now, not a dialog: queries run against the document.
  await user.click(screen.getByRole("button", { name: "打印标签" }))

  // Its own overlay -- a dry run for just this one asset, not the whole list.
  await screen.findByText("1 台设备，1 个类别，将产生 1 个打印作业。")
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/print", { ids: ["a1"], dry_run: true }),
  )
})

// Printing is a property of the installation: with no print service
// configured there is no button, not one that would answer "not configured".
it("has no print button without a print service configured", async () => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({ batch_id: null, transfers: [{ id: "t1" }] })

  renderWithProviders(<AssetDetail />)
  await screen.findByText("112394521950")

  expect(
    screen.queryByRole("button", { name: "打印标签" }),
  ).not.toBeInTheDocument()
})

// What the device is, before what can be done to it (015, decision 104).
describe("the attribute section", () => {
  // Its own, because this block sits outside describe("AssetDetail") and so
  // never sees that one's hooks.
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation(route)
    post.mockReset().mockResolvedValue({ batch_id: null, transfers: [{ id: "t1" }] })
    patch.mockReset()
    del.mockReset()
  })

  it("shows every field's value without unfolding anything", async () => {
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    // The schema is a second request; wait for a field rather than for the
    // device, or the section is still showing its empty state.
    await screen.findByText("基准 MAC")
    const card = screen.getByText("设备属性").closest("section") as HTMLElement
    expect(within(card).getByText("基准 MAC")).toBeInTheDocument()
    expect(within(card).getByText("001A2B3C4D5E")).toBeInTheDocument()
    expect(within(card).getByText("固件版本")).toBeInTheDocument()
    expect(within(card).getByText("2.1.3")).toBeInTheDocument()
  })

  // The named-value check above proves two fields survived. This proves none
  // went missing: a four-column grid is a place where a field can be dropped
  // and nobody notices, because the row still looks full.
  it("draws one pair per field, and no more", async () => {
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    await screen.findByText("基准 MAC")
    const section = screen.getByText("设备属性").closest("section") as HTMLElement
    const keys = [...section.querySelectorAll("dt")].map((e) => e.textContent)

    expect(keys).toEqual(["基准 MAC", "固件版本"])
    expect(section.querySelectorAll("dd")).toHaveLength(keys.length)
  })

  // Identity comes before history: what the device IS reads before what has
  // happened to it. The transfer form it used to sit above is a dialog now.
  it("sits above the movement history", async () => {
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    const attrs = screen.getByRole("heading", { name: t.assets.attrs })
    const history = screen.getByRole("heading", { name: t.assets.transfers })
    expect(attrs.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // A built-in that already has a place on this page is not repeated here:
  // two places to look is two places to keep right.
  //
  // The note is the exception, and it is the exception because it had no place
  // at all -- holder, owner and status are each in the band above, while the
  // note was only ever inside the form that edits it. Reading it should not
  // cost opening that form, which is what 015 decision 104 said about the
  // values below it.
  it("leaves the built-ins where they already are, except the one that had nowhere", async () => {
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    const card = screen.getByText("设备属性").closest("section") as HTMLElement
    for (const builtin of ["当前持有方", "当前负责人", "状态"]) {
      expect(within(card).queryByText(builtin)).not.toBeInTheDocument()
    }
    expect(within(card).getByText("备注")).toBeInTheDocument()
    expect(within(card).getByText("屏幕左下角有划痕")).toBeInTheDocument()
    // And the editable panel below is untouched.
    expect(screen.getByRole("button", { name: "编辑设备属性" })).toBeInTheDocument()
  })

  // A model field belongs to the card only when the device is one of its
  // models -- the same narrowing the entry form and the server both apply.
  it("carries a model field only for a device of that model", async () => {
    get.mockReset().mockImplementation((p: string) => {
      if (p.includes("/schema")) {
        return Promise.resolve({
          ...schema,
          fields: [
            ...schema.fields,
            {
              id: "f9", key: "servicetag", label: "ServiceTag", type: "text",
              options: {}, is_unique: false, required: false, sort: 30,
              model_ids: ["m-other"],
            },
          ],
        })
      }
      return route(p)
    })
    renderWithProviders(<AssetDetail />)
    await screen.findByText("112394521950")

    // The fixture asset has no model, so a field belonging to one is not its.
    const card = screen.getByText("设备属性").closest("section") as HTMLElement
    expect(within(card).queryByText("ServiceTag")).not.toBeInTheDocument()
  })
})

// A device whose model has none of its category's fields gets an empty card --
// and the reason matters. Saying "this category has no fields" would send
// someone to the category page to add the field that is already sitting there.
describe("AssetDetail empty attribute card", () => {
  beforeEach(() => {
    navigate.mockReset()
    post.mockReset()
    patch.mockReset()
    del.mockReset()
    get.mockReset().mockImplementation((p: string) => {
      if (p === "/assets/a1") {
        return Promise.resolve({
          asset: { ...asset, model_id: "m-lenovo", attrs: {}, archived_attrs: {} },
          value_history: [],
        })
      }
      if (p.includes("/schema")) {
        return Promise.resolve({
          ...schema,
          fields: [{ id: "f9", key: "servicetag", label: "ServiceTag", type: "text",
                     options: {}, is_unique: false, required: false, sort: 10,
                     model_ids: ["m-dell"] }],
        })
      }
      return route(p)
    })
  })

  it("blames the model, not the category, when the category does have fields", async () => {
    renderWithProviders(<AssetDetail />)
    expect(await screen.findByText(/都绑在别的型号上/)).toBeInTheDocument()
    expect(screen.queryByText(/还没有配置任何字段/)).not.toBeInTheDocument()
  })
})
