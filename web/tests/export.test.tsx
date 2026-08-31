import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Assets } from "@/routes/Assets"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { chooseByLabel } from "@/test/choose"

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => vi.fn() }
})

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return { ...actual, api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() } }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]
const users = [
  { id: "u1", email: "a@example.com", name: "管理员", auth_type: "local", status: "active" },
]
const page = { items: [], total: 0, offset: 0, limit: 50 }
const schema = {
  category: categories[0],
  fields: [],
}

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) => {
    const st = statusRoute(p)
    if (st) return st
    if (p === "/categories") return Promise.resolve(categories)
    if (p === "/users") return Promise.resolve(users)
    if (p.endsWith("/schema")) return Promise.resolve(schema)
    return Promise.resolve(page)
  })
  localStorage.clear()
})

describe("export from the asset list", () => {
  it("exports everything when no filter is set", async () => {
    renderWithProviders(<Assets />)
    const link = await screen.findByRole("link", { name: "导出 CSV" })
    expect(link).toHaveAttribute("href", "/api/export.csv?")
    expect(link).toHaveAttribute("download")
  })

  // An export that quietly ignored the filters would be worse than none.
  it("carries the active filters into the export URL", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByRole("link", { name: "导出 CSV" })

    await user.type(screen.getByLabelText(/搜索资产/), "4D5E")
    await chooseByLabel(user, "类别", "网络设备")
    await chooseByLabel(user, "状态", "已签出")

    const href = screen.getByRole("link", { name: "导出 CSV" }).getAttribute("href")!
    const params = new URLSearchParams(href.split("?")[1])
    expect(params.get("q")).toBe("4D5E")
    expect(params.get("category_id")).toBe("net")
    expect(params.get("include_descendants")).toBe("true")
    expect(params.get("status")).toBe("in_use")
  })

  it("follows the descendants switch", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByRole("link", { name: "导出 CSV" })

    await chooseByLabel(user, "类别", "网络设备")
    await user.click(screen.getByLabelText("含子类别"))

    const href = screen.getByRole("link", { name: "导出 CSV" }).getAttribute("href")!
    expect(new URLSearchParams(href.split("?")[1]).get("include_descendants")).toBe("false")
  })
})
