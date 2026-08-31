import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Overview } from "@/routes/Overview"
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
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]

const overview = {
  status_counts: [
    { status: "in_stock", count: 42 },
    { status: "in_use", count: 17 },
    { status: "in_repair", count: 3 },
    { status: "lost", count: 0 },
    { status: "retired", count: 8 },
  ],
  category_distribution: [{ category_id: "net", name: "网络设备", count: 62 }],
  total: 70,
  recent_transfers: [
    {
      id: "t1",
      asset_id: "a1",
      batch_id: "b1",
      kind: "checkout",
      from_status: "in_stock",
      from_holder: { type: "entity", id: "loc", name: "上海仓库" },
      from_owner_id: "u1",
      to_status: "in_use",
      to_holder: { type: "entity", id: "cust", name: "XX 集团" },
      to_owner_id: "u1",
      due_at: null,
      created_at: "2026-08-28T09:00:00Z",
      edited_at: null,
      edited_by: null,
    },
  ],
}

function route(p: string, cats = categories) {
  if (p === "/categories") return Promise.resolve(cats)
  return Promise.resolve(overview)
}

beforeEach(() => {
  navigate.mockReset()
  get.mockReset().mockImplementation((p: string) => route(p))
})

describe("Overview", () => {
  it("shows a card for every status, including the ones at zero", async () => {
    renderWithProviders(<Overview />)
    expect(await screen.findByRole("button", { name: "在库 42 台" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "已签出 17 台" })).toBeInTheDocument()
    // A card that vanishes at zero makes the row jump around as stock moves.
    expect(screen.getByRole("button", { name: "丢失 0 台" })).toBeInTheDocument()
    expect(screen.getByText("共 70 台")).toBeInTheDocument()
  })

  it("takes you to the correspondingly filtered asset list", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)

    await user.click(await screen.findByRole("button", { name: "已签出 17 台" }))
    expect(navigate).toHaveBeenCalledWith("/assets?status=in_use")
  })

  it("makes the status cards reachable from the keyboard", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)
    const card = await screen.findByRole("button", { name: "维修中 3 台" })

    card.focus()
    await user.keyboard("{Enter}")
    expect(navigate).toHaveBeenCalledWith("/assets?status=in_repair")
  })

  it("says the distribution leaves retired devices out", async () => {
    renderWithProviders(<Overview />)
    const section = await screen.findByText("类别分布")
    expect(section).toHaveTextContent("含子类别，不含已报废")
    expect(screen.getByText("62 台")).toBeInTheDocument()
  })

  it("folds a batch in the recent list", async () => {
    renderWithProviders(<Overview />)
    // Scoped to the timeline: the category distribution is a list too.
    const timeline = await screen.findByRole("list", { name: "流转历史" })
    const rows = within(timeline).getAllByRole("listitem")
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText("XX 集团", { exact: false })).toBeInTheDocument()
  })

  it("starts a new asset in the chosen category", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Overview />)

    await user.click(await screen.findByRole("combobox", { name: "类别" }))
    await user.click(await screen.findByRole("option", { name: "网络设备" }))
    await user.click(screen.getByRole("button", { name: "开始录入" }))
    expect(navigate).toHaveBeenCalledWith("/assets?new=1&category_id=net")
  })

  // A fresh install has nothing configured; the card has to point at the one
  // thing that must happen first rather than offering an empty dropdown.
  it("asks for a category first when none exists", async () => {
    get.mockImplementation((p: string) => route(p, []))
    const user = userEvent.setup()
    renderWithProviders(<Overview />)

    expect(await screen.findByText("还没有配置任何类别")).toBeInTheDocument()
    expect(screen.queryByLabelText("类别")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "去配置类别" }))
    expect(navigate).toHaveBeenCalledWith("/categories")
  })

  it("shows an error state with a retry", async () => {
    get.mockImplementation((p: string) =>
      p === "/overview" ? Promise.reject(new Error("服务不可用")) : Promise.resolve(categories),
    )
    renderWithProviders(<Overview />)
    expect(await screen.findByRole("alert")).toHaveTextContent("服务不可用")
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })
})
