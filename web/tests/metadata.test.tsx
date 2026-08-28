import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Fields } from "@/routes/Fields"
import { Holders } from "@/routes/Holders"
import { Users } from "@/routes/Users"
import { Categories } from "@/routes/Categories"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: vi.fn(),
    },
  }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", sn_template: "" },
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: "net", path: "/net/rt/", sn_template: "x" },
]

const fields = [
  { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true },
  { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false },
]

const holders = [
  { id: "h1", type: "location", name: "上海仓库", parent_id: null, is_default_stock: false },
  { id: "h2", type: "company", name: "XX 集团", parent_id: null, is_default_stock: false },
]

const users = [
  { id: "u1", email: "admin@example.com", name: "管理员", auth_type: "local", status: "active" },
  { id: "u2", email: "old@example.com", name: "离职同事", auth_type: "local", status: "disabled" },
]

const schema = {
  category: categories[1],
  sn_template: "x",
  sn_template_from: "rt",
  fields: [
    { ...fields[0], required: true, sort: 10, inherited_from: "net" },
    { ...fields[1], required: false, sort: 20 },
  ],
}

function route(p: string) {
  if (p === "/categories") return Promise.resolve(categories)
  if (p === "/fields") return Promise.resolve(fields)
  if (p === "/holders") return Promise.resolve(holders)
  if (p === "/users") return Promise.resolve(users)
  if (p.endsWith("/schema")) return Promise.resolve(schema)
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
})

describe("Fields page", () => {
  it("lists the global field library with its types", async () => {
    renderWithProviders(<Fields />)
    const row = await screen.findByRole("row", { name: /基准 MAC/ })
    expect(within(row).getByText("MAC 地址")).toBeInTheDocument()
    expect(within(row).getByText("唯一")).toBeInTheDocument()
  })

  it("reveals a template input only for a computed field", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Fields />)
    await screen.findByRole("row", { name: /基准 MAC/ })

    expect(screen.queryByLabelText("模板")).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("类型"), "computed")
    expect(screen.getByLabelText("模板")).toBeInTheDocument()
  })

  it("creates a field with the values typed in", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Fields />)
    await screen.findByRole("row", { name: /基准 MAC/ })

    await user.type(screen.getByLabelText(/键名/), "rack")
    await user.type(screen.getByLabelText(/显示名/), "机柜位")
    await user.click(screen.getByLabelText("全局唯一"))
    await user.click(screen.getByRole("button", { name: "新建信息项" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/fields", {
        key: "rack",
        label: "机柜位",
        type: "text",
        is_unique: true,
        options: {},
      }),
    )
  })
})

describe("Holders page", () => {
  it("offers the default stock marker only on a location", async () => {
    renderWithProviders(<Holders />)
    const warehouse = await screen.findByRole("row", { name: /上海仓库/ })
    expect(within(warehouse).getByRole("button", { name: "设为默认库存点" })).toBeInTheDocument()

    const company = screen.getByRole("row", { name: /XX 集团/ })
    expect(within(company).queryByRole("button", { name: "设为默认库存点" })).not.toBeInTheDocument()
  })

  it("marks a location as the default stock point", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)
    const warehouse = await screen.findByRole("row", { name: /上海仓库/ })
    await user.click(within(warehouse).getByRole("button", { name: "设为默认库存点" }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/holders/h1", { is_default_stock: true }),
    )
  })
})

describe("Users page", () => {
  it("separates active from disabled accounts", async () => {
    renderWithProviders(<Users />)
    const active = await screen.findByRole("row", { name: /admin@example.com/ })
    expect(within(active).getByText("正常")).toBeInTheDocument()
    expect(within(active).getByRole("button", { name: "停用" })).toBeInTheDocument()

    const disabled = screen.getByRole("row", { name: /old@example.com/ })
    expect(within(disabled).getByText("已停用")).toBeInTheDocument()
    expect(within(disabled).queryByRole("button", { name: "停用" })).not.toBeInTheDocument()
  })

  it("shows why disabling was refused instead of failing quietly", async () => {
    patch.mockRejectedValue(
      new ApiError(409, "reference_blocked", "user still owns assets: 15 asset(s) must be transferred first"),
    )
    const user = userEvent.setup()
    renderWithProviders(<Users />)
    const active = await screen.findByRole("row", { name: /admin@example.com/ })
    await user.click(within(active).getByRole("button", { name: "停用" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("15 asset(s) must be transferred first")
  })
})

describe("Categories page", () => {
  it("renders the tree and shows which ancestor a field came from", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)

    await user.click(await screen.findByRole("button", { name: "SDWAN 路由器" }))

    // The label also appears in the bind dropdown, so scope to the field list.
    const inherited = await screen.findByRole("listitem", { name: /基准 MAC/ })
    expect(within(inherited).getByText("继承自网络设备")).toBeInTheDocument()
    expect(within(inherited).getByText("必填")).toBeInTheDocument()

    const own = screen.getByRole("listitem", { name: /固件版本/ })
    expect(within(own).queryByText(/继承自/)).not.toBeInTheDocument()
  })

  it("surfaces a binding conflict rather than swallowing it", async () => {
    post.mockRejectedValue(
      new ApiError(409, "unique_conflict", 'field key already bound on this category chain: "mac" is already bound on 网络设备'),
    )
    const user = userEvent.setup()
    renderWithProviders(<Categories />)

    await user.click(await screen.findByRole("button", { name: "SDWAN 路由器" }))
    await user.selectOptions(await screen.findByLabelText("绑定信息项"), "f1")
    await user.click(screen.getByRole("button", { name: "绑定信息项" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already bound/)
  })
})
