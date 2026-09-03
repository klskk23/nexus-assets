import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Assets } from "@/routes/Assets"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseFromMenu, openMenu } from "@/test/menu"
import { statusRoute } from "./fixtures/statuses"
import { chooseByLabel } from "@/test/choose"
import { stubDownloads, type Downloads } from "@/test/downloads"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate }
})

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: vi.fn(),
      del: (p: string) => del(p),
    },
  }
})

/**
 * Runs an export and returns what was asked for.
 *
 * The export is a dialog now: a category is what decides the columns, so it is
 * chosen there rather than taken from whatever the list happened to show.
 */
async function exportQuery(
  user: ReturnType<typeof userEvent.setup>,
  dl: Downloads,
): Promise<URLSearchParams> {
  await user.click(screen.getByRole("button", { name: "导出 CSV" }))
  const dialog = await screen.findByRole("dialog")
  await chooseByLabel(user, "资产类别", "网络设备")
  await user.click(within(dialog).getByRole("button", { name: "导出" }))
  await waitFor(() => expect(dl.urls.some((u) => u.includes("/export.csv"))).toBe(true))
  const url = dl.urls.find((u) => u.includes("/export.csv"))!
  return new URLSearchParams(url.split("?")[1])
}

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "srv", code: "SRV", name: "服务器", parent_id: null, path: "/srv/", display_key: "" },
]

const schema = {
  category: categories[0],
  fields: [
    { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 10 },
    { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false, required: false, sort: 20 },
  ],
}

// A category with entirely different fields, which is what makes a column
// chosen under one of them meaningless under the other.
const serverSchema = {
  category: categories[1],
  fields: [
    { id: "f3", key: "rack", label: "机柜位", type: "text", options: {}, is_unique: false, required: false, sort: 10 },
  ],
}

const page = {
  items: [
    {
      id: "a1",
      display_name: "112394521950",
      category_id: "net",
      model_id: "m1",
      status: "in_stock",
      owner: { id: "u1", name: "管理员" },
      holder: { type: "entity", id: "loc", name: "上海仓库" },
      attrs: { mac: "001A2B3C4D5E", firmware: "2.1.3" },
      note: "屏幕左下角有划痕",
      version: 1,
      created_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
  ],
  total: 1,
  offset: 0,
  limit: 50,
}

const users = [
  { id: "u1", email: "a@example.com", name: "管理员", auth_type: "local", status: "active" },
  { id: "u2", email: "z@example.com", name: "张三", auth_type: "local", status: "active" },
  { id: "u3", email: "g@example.com", name: "离职的", auth_type: "local", status: "disabled" },
]

const holders = [
  {
    id: "loc", type: "location", name: "上海仓库",
    parent_id: null, note: "", is_default_stock: true,
  },
  {
    id: "co", type: "company", name: "XX 集团",
    parent_id: null, note: "", is_default_stock: false,
  },
]

function route(path: string) {
  const st = statusRoute(path)
  if (st) return st

  if (path === "/capabilities") return Promise.resolve({ printing: true })
  if (path === "/print/presets") return Promise.resolve({ presets: [] })
  if (path === "/categories") return Promise.resolve(categories)
  if (path === "/holders") return Promise.resolve(holders)
  if (path === "/users") return Promise.resolve(users)
  if (path === "/models") {
    return Promise.resolve([
      { id: "m1", name: "SDWAN-X100", vendor: "Acme", category_ids: ["net"], attr_defaults: {} },
    ])
  }
  if (path.endsWith("/schema")) {
    return Promise.resolve(path.includes("/srv/") ? serverSchema : schema)
  }
  if (path.startsWith("/assets")) return Promise.resolve(page)
  return Promise.resolve([])
}

describe("Assets list", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset()
    post.mockReset()
    get.mockImplementation(route)
    localStorage.clear()
  })

  it("focuses the search box on mount so a scanner can type straight away", async () => {
    renderWithProviders(<Assets />)
    await waitFor(() => expect(screen.getByLabelText(/搜索资产/)).toHaveFocus())
  })

  // The list is read across categories whenever the filter is off, and a
  // number alone does not say what kind of thing it is on.
  it("names each device's category", async () => {
    renderWithProviders(<Assets />)
    const row = await screen.findByRole("row", { name: /112394521950/ })
    expect(within(row).getByText("网络设备")).toBeInTheDocument()
  })

  // The picker offers this category's fields, so a choice made under one
  // category is meaningless under the next -- it used to come back anyway, as
  // a header with the raw key on it and an empty cell in every row.
  it("keeps each category's columns to itself", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "类别", "网络设备")
    await user.click(await screen.findByRole("button", { name: "显示列" }))
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "固件版本" }))
    await user.keyboard("{Escape}")
    expect(await screen.findByRole("columnheader", { name: "固件版本" })).toBeInTheDocument()

    await chooseByLabel(user, "类别", "服务器")
    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "固件版本" })).not.toBeInTheDocument(),
    )
    // Nor under its raw key, which is what a header with no field behind it
    // fell back to.
    expect(screen.queryByRole("columnheader", { name: "firmware" })).not.toBeInTheDocument()

    // Back where it was chosen, it is still chosen.
    await chooseByLabel(user, "类别", "网络设备")
    expect(await screen.findByRole("columnheader", { name: "固件版本" })).toBeInTheDocument()
  })

  it("shows no field columns at all with the category filter off", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "类别", "网络设备")
    await user.click(await screen.findByRole("button", { name: "显示列" }))
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "固件版本" }))
    await user.keyboard("{Escape}")
    await screen.findByRole("columnheader", { name: "固件版本" })

    await chooseByLabel(user, "类别", "全部类别")
    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "固件版本" })).not.toBeInTheDocument(),
    )
    // The picker stays: the built-in columns exist whatever the filter says,
    // so there is still something to choose. What is gone is the field group,
    // because with no category there are no fields to offer.
    await user.click(screen.getByRole("button", { name: "显示列" }))
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "固件版本" }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("menuitemcheckbox", { name: "持有方" })).toBeInTheDocument()
  })

  it("shows the total and the fixed columns", async () => {
    renderWithProviders(<Assets />)
    expect(await screen.findByText(/共 1 条/)).toBeInTheDocument()
    const row = screen.getByRole("row", { name: /112394521950/ })
    expect(within(row).getByText("在库")).toBeInTheDocument()
    expect(within(row).getByText("上海仓库")).toBeInTheDocument()
    expect(within(row).getByText("管理员")).toBeInTheDocument()
  })

  it("passes the category filter and the descendants switch to the query", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "类别", "网络设备")
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(expect.stringContaining("include_descendants=true")),
    )

    await user.click(screen.getByLabelText("含子类别"))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(expect.stringContaining("include_descendants=false")),
    )
  })

  it("adds a custom-field column and remembers the choice in localStorage", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "类别", "网络设备")
    await user.click(await screen.findByRole("button", { name: "显示列" }))
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "固件版本" }))

    await waitFor(() =>
      expect(screen.getByRole("columnheader", { name: "固件版本" })).toBeInTheDocument(),
    )
    expect(screen.getByRole("cell", { name: "2.1.3" })).toBeInTheDocument()
    // Remembered against the category it was chosen under.
    expect(JSON.parse(localStorage.getItem("nexus.assetColumns")!).net).toContain("firmware")

    // The menu stays open: picking columns is several decisions in a row, and
    // closing after each one would make it one trip per column.
    await user.click(screen.getByRole("menuitemcheckbox", { name: "固件版本" }))
    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "固件版本" })).not.toBeInTheDocument(),
    )
  })

  it("jumps straight to the device when the search hits exactly one", async () => {
    get.mockImplementation((p: string) =>
      p.startsWith("/assets") ? Promise.resolve({ ...page, exact_match_id: "a1" }) : route(p),
    )
    renderWithProviders(<Assets />)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/assets/a1"))
  })

  it("shows an empty state rather than a blank page", async () => {
    get.mockImplementation((p: string) =>
      p.startsWith("/assets") ? Promise.resolve({ items: [], total: 0, offset: 0, limit: 50 }) : route(p),
    )
    renderWithProviders(<Assets />)
    expect(await screen.findByText("还没有任何资产")).toBeInTheDocument()
  })

  it("shows an error state with a retry affordance", async () => {
    get.mockImplementation((p: string) =>
      p.startsWith("/assets") ? Promise.reject(new Error("网络不可用")) : route(p),
    )
    renderWithProviders(<Assets />)
    expect(await screen.findByRole("alert")).toHaveTextContent("网络不可用")
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })
})

// Before this the list fetched one server-default page and stopped: the total
// said 1,847 and there was no way to reach the 51st device.
describe("Assets paging", () => {
  const many = { ...page, total: 137 }

  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation((p: string) =>
      p.startsWith("/assets") ? Promise.resolve(many) : route(p),
    )
    localStorage.clear()
  })

  function lastAssetCall() {
    const calls = get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/assets"))
    return new URLSearchParams(calls[calls.length - 1].split("?")[1])
  }

  it("asks for twenty rows by default", async () => {
    renderWithProviders(<Assets />)
    await screen.findByText(/共 137 条/)

    expect(lastAssetCall().get("limit")).toBe("20")
    expect(lastAssetCall().get("offset")).toBe("0")
    expect(screen.getByText("第 1–20 条，共 137 条")).toBeInTheDocument()
  })

  it("moves through the pages", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 137 条/)

    await user.click(screen.getByRole("link", { name: "3" }))
    await waitFor(() => expect(lastAssetCall().get("offset")).toBe("40"))
    expect(screen.getByText("第 41–60 条，共 137 条")).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "上一页" }))
    await waitFor(() => expect(lastAssetCall().get("offset")).toBe("20"))
  })

  // The accessible name comes from an aria-label we pass, so it stayed right
  // while the words on screen were shadcn's own English literals.
  it("writes the page links in the reader's language, not the component's", async () => {
    renderWithProviders(<Assets />)
    await screen.findByText(/共 137 条/)

    expect(screen.getByRole("link", { name: "上一页" })).toHaveTextContent("上一页")
    expect(screen.getByRole("link", { name: "下一页" })).toHaveTextContent("下一页")
  })

  it("offers 20, 50 and 100 rows a page", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 137 条/)

    await user.click(screen.getByRole("combobox", { name: "每页" }))
    const sizes = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(sizes).toEqual(["20 条", "50 条", "100 条"])

    await user.click(screen.getByRole("option", { name: "100 条" }))
    await waitFor(() => expect(lastAssetCall().get("limit")).toBe("100"))
  })

  // Page 7 of a different question is not a place anyone meant to be.
  it("returns to the first page when the filter changes", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 137 条/)

    await user.click(screen.getByRole("link", { name: "2" }))
    await waitFor(() => expect(lastAssetCall().get("offset")).toBe("20"))

    await chooseByLabel(user, "状态", "在库")
    await waitFor(() => expect(lastAssetCall().get("offset")).toBe("0"))
  })

  // A CSV of whichever page you happened to be looking at would be a trap.
  it("keeps paging out of the export", async () => {
    const dl = stubDownloads()
    try {
      const user = userEvent.setup()
      renderWithProviders(<Assets />)
      await screen.findByText(/共 137 条/)
      await user.click(screen.getByRole("link", { name: "2" }))

      const params = await exportQuery(user, dl)
      expect(params.get("limit")).toBeNull()
      expect(params.get("offset")).toBeNull()
    } finally {
      dl.restore()
    }
  })

  it("draws no pager when everything fits on one page", async () => {
    get.mockImplementation(route)
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)
    expect(screen.queryByRole("link", { name: "下一页" })).not.toBeInTheDocument()
  })
})


// The list could already be filtered by owner through the API; the filter bar
// simply never offered it.
describe("Assets owner filter", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation(route)
    localStorage.clear()
  })

  it("filters by owner", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "负责人", "张三")
    await waitFor(() => {
      const asked = get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/assets"))
      expect(new URLSearchParams(asked[asked.length - 1].split("?")[1]).get("owner_id")).toBe("u2")
    })
  })

  // A disabled account cannot be given new devices, so offering it as a filter
  // would only ever return what somebody left behind.
  it("offers only active accounts", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await user.click(screen.getByRole("combobox", { name: "负责人" }))
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(names).toContain("张三")
    expect(names).not.toContain("离职的")
  })

  // Export follows the filters, and this is one of them.
  it("carries the owner into the export", async () => {
    const dl = stubDownloads()
    try {
      const user = userEvent.setup()
      renderWithProviders(<Assets />)
      await screen.findByText(/共 1 条/)

      await chooseByLabel(user, "负责人", "张三")
      expect((await exportQuery(user, dl)).get("owner_id")).toBe("u2")
    } finally {
      dl.restore()
    }
  })
})

describe("Assets holder filter", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation(route)
    localStorage.clear()
  })

  it("filters by holder, sending the kind alongside the id", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "持有方", "XX 集团")
    await waitFor(() => {
      const asked = get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/assets"))
      const q = new URLSearchParams(asked[asked.length - 1].split("?")[1])
      expect(q.get("holder_id")).toBe("co")
      // Without the kind an id could match an account and an entity alike.
      expect(q.get("holder_type")).toBe("entity")
    })
  })

  it("carries the holder into the export", async () => {
    const dl = stubDownloads()
    try {
      const user = userEvent.setup()
      renderWithProviders(<Assets />)
      await screen.findByText(/共 1 条/)

      await chooseByLabel(user, "持有方", "上海仓库")
      expect((await exportQuery(user, dl)).get("holder_id")).toBe("loc")
    } finally {
      dl.restore()
    }
  })
})

describe("Assets row gestures", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation(route)
    localStorage.clear()
  })

  // The row carried the pointer cursor while only the number cell listened, so
  // four columns out of five looked clickable and were not.
  it("opens the device from anywhere in the row", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const row = await screen.findByRole("row", { name: /112394521950/ })

    for (const cell of ["在库", "上海仓库", "管理员"]) {
      navigate.mockReset()
      await user.click(within(row).getByText(cell))
      expect(navigate).toHaveBeenCalledWith("/assets/a1")
    }
  })

  // Ticking a row is a different act from opening it, so the checkbox keeps
  // the click to itself.
  it("does not open the device when the checkbox is ticked", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const row = await screen.findByRole("row", { name: /112394521950/ })

    await user.click(within(row).getByRole("checkbox"))
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByText("已选 1 台")).toBeInTheDocument()
  })

  // The same actions the selection bar offers, on one device, without ticking
  // it first.
  it("offers the transfer actions and delete on right-click", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const row = await screen.findByRole("row", { name: /112394521950/ })

    await openMenu(user, row)
    for (const label of ["签出", "归还", "转移", "改负责人", "改状态", "删除"]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument()
    }
  })

  it("starts a transfer for the row it was opened on", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const row = await screen.findByRole("row", { name: /112394521950/ })

    await chooseFromMenu(user, row, "改状态")
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("已选 1 台")
    // Opening a dialog must not have navigated away underneath it.
    expect(navigate).not.toHaveBeenCalled()
  })

  it("deletes one device only after its number has been typed out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const row = await screen.findByRole("row", { name: /112394521950/ })

    await chooseFromMenu(user, row, "删除")
    const dialog = await screen.findByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByRole("textbox"), "112394521950")
    await user.click(confirm)
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith("/assets/a1?confirm=112394521950"),
    )
  })
})

// A single device, without ticking it first: the same reason every other row
// action lives on this menu.
describe("printing one row", () => {
  it("prints the device the menu was opened on", async () => {
    post.mockResolvedValue({
      batches: [
        {
          category_id: "net", category_name: "网络设备", count: 1,
          preset_id: "p1", preset_name: "编号标签", numbers: ["112394521950"],
        },
      ],
    })
    const user = userEvent.setup()
    renderWithProviders(<Assets />)

    const row = await screen.findByRole("row", { name: /112394521950/ })
    await chooseFromMenu(user, row, "打印标签")

    // The confirmation is about that one device, and nothing has printed yet.
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/1 台设备/)).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith("/print", { ids: ["a1"], dry_run: true })
  })

  it("offers nothing to print when no print service is configured", async () => {
    get.mockImplementation((p: string) =>
      p === "/capabilities" ? Promise.resolve({ printing: false }) : route(p),
    )
    const user = userEvent.setup()
    renderWithProviders(<Assets />)

    const row = await screen.findByRole("row", { name: /112394521950/ })
    const menu = await openMenu(user, row)
    expect(within(menu).queryByRole("menuitem", { name: "打印标签" })).not.toBeInTheDocument()
  })
})

describe("Assets column picker", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset().mockImplementation(route)
    localStorage.clear()
  })

  // What a fresh browser shows. The vendor is off by default: it matters when
  // two suppliers sell the same model, which is real but not the common case.
  it("shows the built-in columns it should, and not the vendor", async () => {
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    for (const name of ["编号", "类别", "状态", "持有方", "型号", "负责人", "备注"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole("columnheader", { name: "厂商" })).not.toBeInTheDocument()
  })

  it("adds the vendor when it is ticked, and remembers it", async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await user.click(screen.getByRole("button", { name: "显示列" }))
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "厂商" }))
    await user.keyboard("{Escape}")
    expect(await screen.findByRole("columnheader", { name: "厂商" })).toBeInTheDocument()

    // The choice is per person and per browser, so it survives a reload.
    unmount()
    renderWithProviders(<Assets />)
    expect(await screen.findByRole("columnheader", { name: "厂商" })).toBeInTheDocument()
  })

  it("takes a built-in column away again", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await user.click(screen.getByRole("button", { name: "显示列" }))
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "备注" }))
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "备注" })).not.toBeInTheDocument(),
    )
    // The number stays whatever is ticked: it is what the row is read by.
    expect(screen.getByRole("columnheader", { name: "编号" })).toBeInTheDocument()
  })

  it("names the model and its vendor from the model list", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await user.click(screen.getByRole("button", { name: "显示列" }))
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "厂商" }))
    await user.keyboard("{Escape}")

    const row = screen.getByRole("row", { name: /112394521950/ })
    expect(within(row).getByText("SDWAN-X100")).toBeInTheDocument()
    expect(within(row).getByText("Acme")).toBeInTheDocument()
  })
})
