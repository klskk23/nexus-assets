import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Holders } from "@/routes/Holders"
import { Categories } from "@/routes/Categories"
import { Audit } from "@/routes/Audit"
import { renderWithProviders } from "@/test/renderWithProviders"
import { listed } from "@/test/listing"
import { chooseByLabel } from "@/test/choose"
import { useLocation } from "react-router"
import type { HolderEntity } from "@/lib/types"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(undefined),
    },
  }
})

const holders: HolderEntity[] = [
  { id: "co", type: "company", name: "XX 集团", parent_id: null, note: "总部", is_default_stock: false },
  { id: "wh", type: "location", name: "上海仓库", parent_id: null, note: "B 座三层", is_default_stock: true },
  { id: "bj", type: "location", name: "北京仓库", parent_id: null, note: "", is_default_stock: false },
]

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: "net", path: "/net/rt/", display_key: "" },
]

function route(p: string) {
  const usage = /^\/holders\/(.+)\/usage$/.exec(p)
  if (usage) return Promise.resolve({ assets: 0, children: 0, history: 0 })
  if (p.startsWith("/holders")) return Promise.resolve(listed(holders, p))
  if (p.startsWith("/categories")) return Promise.resolve(categories)
  if (p.startsWith("/audit")) return Promise.resolve({ items: [], total: 0, offset: 0, limit: 20 })
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
})

/** Shows the address the router is on, which is where list state belongs. */
function Address() {
  const location = useLocation()
  return <output data-testid="address">{location.search}</output>
}

/** The paths a metadata list was asked for, newest last. */
const asked = (prefix: string) =>
  get.mock.calls.map((call) => String(call[0])).filter((p) => p.startsWith(prefix))

describe("every table page searches, filters and pages the same way", () => {
  it("sends what was typed in the search box to the server", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />)
    await screen.findByRole("row", { name: /上海仓库/ })

    // The box says what it searches rather than just "搜索" -- a page that
    // searches names and notes should not have to be guessed at.
    await user.type(screen.getByLabelText("名称、备注"), "北京")

    await waitFor(() => expect(asked("/holders?").at(-1)).toContain("q=%E5%8C%97%E4%BA%AC"))
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /上海仓库/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole("row", { name: /北京仓库/ })).toBeInTheDocument()
  })

  it("narrows by a filter and puts it in the address", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <Holders />
        <Address />
      </>,
    )
    await screen.findByRole("row", { name: /上海仓库/ })

    await chooseByLabel(user, "类型", "公司")

    await waitFor(() => expect(asked("/holders?").at(-1)).toContain("type=company"))
    // In the address, so opening a holder and coming back finds the same
    // question rather than the whole list again.
    await waitFor(() =>
      expect(screen.getByTestId("address")).toHaveTextContent("type=company"),
    )
  })

  it("draws no paging controls for a list that fits on one page", async () => {
    renderWithProviders(<Holders />)
    await screen.findByRole("row", { name: /上海仓库/ })

    expect(screen.queryByRole("button", { name: "上一页" })).not.toBeInTheDocument()
    // The count stays: "how many are there" is a question a short list has too.
    expect(screen.getByText(/共 3 条/)).toBeInTheDocument()
  })
})

describe("the category tree", () => {
  it("flattens to full paths while searching, and folds back after", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await screen.findByRole("row", { name: /SDWAN 路由器/ })

    await user.type(screen.getByLabelText("名称、编码"), "SDWAN")

    // Only the hit is left, so the indent has nothing to be measured against
    // -- the row says where it sits instead.
    const row = await screen.findByRole("row", { name: /网络设备 \/ SDWAN 路由器/ })
    expect(row).toBeInTheDocument()
    expect(screen.queryByRole("row", { name: /^网络设备$/ })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText("名称、编码"))
    await screen.findByRole("row", { name: /^网络设备/ })
  })
})

describe("the audit log", () => {
  it("has the same search box as every other table", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Audit />)
    await waitFor(() => expect(asked("/audit").length).toBeGreaterThan(0))

    await user.type(screen.getByLabelText("操作人、对象编号"), "张三")

    await waitFor(() =>
      expect(asked("/audit").at(-1)).toContain("q=%E5%BC%A0%E4%B8%89"),
    )
  })
})
