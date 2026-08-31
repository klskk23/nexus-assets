import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Assets } from "@/routes/Assets"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseFromMenu, openMenu } from "@/test/menu"
import { statusRoute } from "./fixtures/statuses"
import { chooseByLabel } from "@/test/choose"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate }
})

const get = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: (p: string) => del(p) },
  }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]

const schema = {
  category: categories[0],
  fields: [
    { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 10 },
    { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false, required: false, sort: 20 },
  ],
}

const page = {
  items: [
    {
      id: "a1",
      display_name: "112394521950",
      category_id: "net",
      model_id: null,
      status: "in_stock",
      owner: { id: "u1", name: "管理员" },
      holder: { type: "entity", id: "loc", name: "上海仓库" },
      attrs: { mac: "001A2B3C4D5E", firmware: "2.1.3" },
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

  if (path === "/categories") return Promise.resolve(categories)
  if (path === "/holders") return Promise.resolve(holders)
  if (path === "/users") return Promise.resolve(users)
  if (path.endsWith("/schema")) return Promise.resolve(schema)
  if (path.startsWith("/assets")) return Promise.resolve(page)
  return Promise.resolve([])
}

describe("Assets list", () => {
  beforeEach(() => {
    navigate.mockReset()
    get.mockReset()
    get.mockImplementation(route)
    localStorage.clear()
  })

  it("focuses the search box on mount so a scanner can type straight away", async () => {
    renderWithProviders(<Assets />)
    await waitFor(() => expect(screen.getByLabelText(/搜索资产/)).toHaveFocus())
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
    const toggle = await screen.findByLabelText("固件版本")
    await user.click(toggle)

    await waitFor(() =>
      expect(screen.getByRole("columnheader", { name: "固件版本" })).toBeInTheDocument(),
    )
    expect(screen.getByRole("cell", { name: "2.1.3" })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem("nexus.assetColumns")!)).toContain("firmware")
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
  it("keeps paging out of the export link", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 137 条/)
    await user.click(screen.getByRole("link", { name: "2" }))

    const href = screen.getByRole("link", { name: "导出 CSV" }).getAttribute("href")!
    const params = new URLSearchParams(href.split("?")[1])
    expect(params.get("limit")).toBeNull()
    expect(params.get("offset")).toBeNull()
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
  it("carries the owner into the export link", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "负责人", "张三")
    const href = screen.getByRole("link", { name: "导出 CSV" }).getAttribute("href")!
    expect(new URLSearchParams(href.split("?")[1]).get("owner_id")).toBe("u2")
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

  it("carries the holder into the export link", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText(/共 1 条/)

    await chooseByLabel(user, "持有方", "上海仓库")
    const href = screen.getByRole("link", { name: "导出 CSV" }).getAttribute("href")!
    expect(new URLSearchParams(href.split("?")[1]).get("holder_id")).toBe("loc")
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
