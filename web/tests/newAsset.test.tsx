import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { NewAssetDialog } from "@/features/assets/NewAssetDialog"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { chooseByLabel } from "@/test/choose"

const navigate = vi.fn()
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => navigate }
})

const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: (p: string, b: unknown) => post(p, b), patch: vi.fn(), del: vi.fn() },
  }
})

const categories = [
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: null, path: "/rt/", display_key: "" },
]
const schema = {
  category: categories[0],
  fields: [
    { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 10 },
  ],
}
const withLocation = [
  { id: "loc", type: "location", name: "上海仓库", parent_id: null, note: "", is_default_stock: true },
  { id: "loc2", type: "location", name: "北京仓库", parent_id: null, note: "", is_default_stock: false },
]
const me = { id: "u1", email: "a@example.com", name: "管理员", auth_type: "local", status: "active" }
const users = [
  me,
  { id: "u2", email: "z@example.com", name: "张三", auth_type: "local", status: "active" },
  { id: "u3", email: "g@example.com", name: "离职的", auth_type: "local", status: "disabled" },
]

function route(path: string, holders: unknown[] = withLocation) {
  const st = statusRoute(path)
  if (st) return st

  if (path === "/categories") return Promise.resolve(categories)
  if (path === "/holders") return Promise.resolve(holders)
  if (path === "/users") return Promise.resolve(users)
  if (path === "/me") return Promise.resolve(me)
  if (path === "/models") return Promise.resolve([])
  if (path.endsWith("/schema")) return Promise.resolve(schema)
  return Promise.resolve([])
}

beforeEach(() => {
  // Recording a device needs somebody signed in: they are the default owner.
  localStorage.setItem("nexus.token", "t")
  navigate.mockReset()
  get.mockReset().mockImplementation((p: string) => route(p))
  post.mockReset().mockResolvedValue({ id: "a1", display_name: "112394521950" })
})

describe("NewAssetDialog", () => {
  // The status used to be inferred from whether a location had been picked,
  // and the picker started empty -- so recording a device that was sitting in
  // the warehouse produced "已签出" and never said so.
  it("starts in stock, at the default stock point", async () => {
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )
    expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("上海仓库")
  })

  it("records the chosen status and holder", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} initialCategoryID="rt" />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )

    await chooseByLabel(user, "持有方", /北京仓库/)
    await chooseByLabel(user, "负责人", "张三")
    await user.type(await screen.findByLabelText(/基准 MAC/), "001A2B3C4D5E")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/assets",
        expect.objectContaining({
          category_id: "rt",
          status: "in_stock",
          holder_type: "entity",
          holder_id: "loc2",
          owner_id: "u2",
        }),
      ),
    )
  })

  // Handing a device to a person answers "who is responsible" by itself, so
  // the question is not asked -- and the answer sent is that person.
  it("asks for no owner when a person is holding it", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} initialCategoryID="rt" />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("上海仓库"),
    )
    expect(screen.getByRole("combobox", { name: "负责人" })).toBeInTheDocument()

    await chooseByLabel(user, "持有方", "张三")
    expect(screen.queryByRole("combobox", { name: "负责人" })).not.toBeInTheDocument()

    await user.type(await screen.findByLabelText(/基准 MAC/), "001A2B3C4D5E")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/assets",
        expect.objectContaining({ holder_type: "user", holder_id: "u2", owner_id: "u2" }),
      ),
    )
  })

  // A disabled account can neither hold a device nor be answerable for one.
  it("offers only active accounts", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("上海仓库"),
    )

    await user.click(screen.getByRole("combobox", { name: "持有方" }))
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent)
    expect(names).toContain("张三")
    expect(names).not.toContain("离职的")
  })

  it("lets the status be something other than in stock", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} initialCategoryID="rt" />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )

    await chooseByLabel(user, "状态", "维修中")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/assets", expect.objectContaining({ status: "in_repair" })),
    )
  })

  // No status constrains the kind of holder any more, so everything on file is
  // on offer -- a device can start out in a company's custody or in a person's.
  it("offers every holder and every account, whatever the status", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )

    await user.click(screen.getByRole("combobox", { name: "持有方" }))
    const options = await screen.findAllByRole("option")
    for (const o of options) {
      expect(o).not.toHaveAttribute("aria-disabled", "true")
    }
    const names = options.map((o) => o.textContent)
    expect(names).toEqual(expect.arrayContaining(["北京仓库", "管理员", "张三"]))
  })

  // A fresh install has no holders at all, and the first device still has to
  // be recordable -- held by the person recording it.
  it("falls back to the account when no holder exists yet", async () => {
    get.mockImplementation((p: string) => route(p, []))
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)

    // In stock is still the default: the status no longer cares where it sits,
    // so an install with no holders at all still records its first device.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("在库"),
    )
    expect(screen.getByRole("combobox", { name: "持有方" })).toHaveTextContent("管理员")
  })

  it("goes to the new device after recording it", async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<NewAssetDialog open onOpenChange={onOpenChange} initialCategoryID="rt" />)
    await screen.findByLabelText(/基准 MAC/)

    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/assets/a1"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("cannot be submitted without a category", async () => {
    renderWithProviders(<NewAssetDialog open onOpenChange={vi.fn()} />)
    await screen.findByRole("combobox", { name: "类别" })
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })
})
