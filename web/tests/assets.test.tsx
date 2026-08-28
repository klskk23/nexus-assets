import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Assets } from "@/routes/Assets"
import { renderWithProviders } from "@/test/renderWithProviders"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate }
})

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return { ...actual, api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() } }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", sn_template: "" },
]

const schema = {
  category: categories[0],
  sn_template: "{{ .attrs.mac | hex2dec }}",
  sn_template_from: "net",
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
    await waitFor(() => expect(screen.getByLabelText(/搜索编号/)).toHaveFocus())
  })

  it("shows the total and the fixed columns", async () => {
    renderWithProviders(<Assets />)
    expect(await screen.findByText("共 1 条")).toBeInTheDocument()
    const row = screen.getByRole("row", { name: /112394521950/ })
    expect(within(row).getByText("在库")).toBeInTheDocument()
    expect(within(row).getByText("上海仓库")).toBeInTheDocument()
    expect(within(row).getByText("管理员")).toBeInTheDocument()
  })

  it("passes the category filter and the descendants switch to the query", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByText("共 1 条")

    await user.selectOptions(screen.getByLabelText("类别"), "net")
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
    await screen.findByText("共 1 条")

    await user.selectOptions(screen.getByLabelText("类别"), "net")
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
