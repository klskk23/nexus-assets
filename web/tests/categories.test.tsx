import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Categories } from "@/routes/Categories"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"

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
      patch: vi.fn().mockResolvedValue({}),
      del: (p: string) => del(p),
    },
  }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: "net", path: "/net/rt/", display_key: "" },
]

const schema = {
  category: categories[1],
  fields: [
    // Bound here, so it can be detached here.
    { id: "f1", key: "rack", label: "机柜", type: "text", options: {}, is_unique: false, required: false, sort: 10 },
    // Inherited from the parent: detaching it is the parent's business.
    { id: "f2", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 20, inherited_from: "net" },
  ],
}

function route(p: string) {
  if (p === "/categories") return Promise.resolve(categories)
  if (p === "/fields") return Promise.resolve([])
  if (p.endsWith("/schema")) return Promise.resolve(schema)
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue(undefined)
  del.mockReset().mockResolvedValue(undefined)
})

async function selectCategory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /SDWAN 路由器/ }))
}

describe("Categories page", () => {
  // Archiving an information item is gone, so unbinding is the only way to
  // retire one that assets already carry values for. Until now the guard behind
  // it had no route and no button.
  it("detaches a field bound on this category, after confirming", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await selectCategory(user)

    const row = await screen.findByRole("listitem", { name: "机柜" })
    await user.click(within(row).getByRole("button", { name: "解绑" }))

    const dialog = await screen.findByRole("alertdialog")
    // The confirmation has to say what survives, or it reads like a delete.
    expect(dialog).toHaveTextContent("保留")
    await user.click(within(dialog).getByRole("button", { name: "解绑" }))

    await waitFor(() => expect(del).toHaveBeenCalledWith("/categories/rt/bindings/f1"))
  })

  it("offers no unbind control for a field inherited from an ancestor", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await selectCategory(user)

    const row = await screen.findByRole("listitem", { name: "基准 MAC" })
    expect(within(row).queryByRole("button", { name: "解绑" })).not.toBeInTheDocument()
  })

  it("surfaces the guard when something still reads the field", async () => {
    del.mockRejectedValue(
      new ApiError(409, "reference_blocked", "表达式键「设备编号」正在引用 rack，请先修改它们再解绑"),
    )
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await selectCategory(user)

    const row = await screen.findByRole("listitem", { name: "机柜" })
    await user.click(within(row).getByRole("button", { name: "解绑" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "解绑" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("设备编号")
  })
})

// The tree and its bindings are what the page is for; creating a category is
// occasional, so the form waits behind a button instead of taking the top of
// the screen on every visit.
describe("Categories create dialog", () => {
  it("keeps the form behind a button", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await screen.findByRole("button", { name: /SDWAN 路由器/ })

    expect(screen.queryByLabelText(/代号/)).not.toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText(/代号/)).toBeInTheDocument()
  })

  it("creates a category and closes", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await screen.findByRole("button", { name: /SDWAN 路由器/ })

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/代号/), "SW")
    await user.type(within(dialog).getByLabelText("名称"), "交换机")
    await user.click(within(dialog).getByRole("button", { name: "新建类别" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/categories", {
        code: "SW",
        name: "交换机",
        parent_id: null,
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  // Reopening onto the last thing you created is a trap: edit one field,
  // submit, and you have quietly made a near-duplicate.
  it("reopens blank after a successful create", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await screen.findByRole("button", { name: /SDWAN 路由器/ })

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    let dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/代号/), "SW")
    await user.type(within(dialog).getByLabelText("名称"), "交换机")
    await user.click(within(dialog).getByRole("button", { name: "新建类别" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(/代号/)).toHaveValue("")
    expect(within(dialog).getByLabelText("名称")).toHaveValue("")
  })

  // A create failure belongs in the dialog; the page banner is for the binding
  // actions in the panel below, which are a different place entirely.
  it("shows a create failure inside the dialog", async () => {
    post.mockRejectedValue(new ApiError(409, "unique_conflict", "类别编码已存在"))
    const user = userEvent.setup()
    renderWithProviders(<Categories />)
    await screen.findByRole("button", { name: /SDWAN 路由器/ })

    await user.click(screen.getAllByRole("button", { name: "新建类别" })[0])
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/代号/), "RT")
    await user.type(within(dialog).getByLabelText("名称"), "重复")
    await user.click(within(dialog).getByRole("button", { name: "新建类别" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("类别编码已存在")
  })
})
