import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Assets } from "@/routes/Assets"
import { renderWithProviders } from "@/test/renderWithProviders"
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

function route(path: string) {
  if (path === "/categories") return Promise.resolve(categories)
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

// The list is where people work; the delete was only ever on the detail page.
describe("Assets row delete", () => {
  beforeEach(() => {
    navigate.mockReset()
    del.mockReset().mockResolvedValue(undefined)
    get.mockReset().mockImplementation(route)
    localStorage.clear()
  })

  function renderWithDelete() {
    return renderWithProviders(<Assets />)
  }

  it("still requires the number to be typed out", async () => {
    const user = userEvent.setup()
    renderWithDelete()
    await screen.findByText(/共 1 条/)

    await user.click(screen.getByRole("button", { name: "删除 112394521950" }))
    const dialog = await screen.findByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()

    // A row action is quicker to reach, so it must not be quicker to do by
    // accident: the same phrase the detail page asks for.
    await user.type(screen.getByLabelText(/请输入/), "112394521950")
    expect(confirm).toBeEnabled()
  })

  it("names the device in the button so the row it belongs to is unambiguous", async () => {
    renderWithDelete()
    await screen.findByText(/共 1 条/)
    expect(
      screen.getByRole("button", { name: "删除 112394521950" }),
    ).toBeInTheDocument()
  })
})
