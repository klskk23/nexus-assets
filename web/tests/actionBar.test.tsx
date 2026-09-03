import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ActionBar } from "@/features/assets/ActionBar"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"
import { ApiError } from "@/lib/api"

const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: (p: string, b: unknown) => post(p, b), patch: vi.fn(), del: vi.fn() },
  }
})

const users = [{ id: "u2", email: "z@example.com", name: "张三", auth_type: "local", status: "active" }]
const holders = [{ id: "loc", type: "location", name: "上海仓库", parent_id: null, is_default_stock: true }]

const twenty = Array.from({ length: 20 }, (_, i) => `a${i}`)

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) =>
    p === "/users" ? Promise.resolve(users) : Promise.resolve(holders),
  )
  post.mockReset().mockResolvedValue({ batch_id: "b1", transfers: twenty.map((id) => ({ id })) })
})

describe("ActionBar", () => {
  it("stays hidden until something is selected", () => {
    renderWithProviders(<ActionBar selected={[]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)
    expect(screen.queryByText(/已选/)).not.toBeInTheDocument()
  })

  it("sends all twenty asset ids in one request", async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={twenty} onClear={vi.fn()} onDone={onDone} onExport={vi.fn()} />)

    expect(screen.getByText("已选 20 台")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "签出" }))
    await chooseByLabel(user, "账号", "张三")
    await user.type(screen.getByLabelText("备注"), "发往 XX 集团")
    await user.click(screen.getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: twenty,
        note: "发往 XX 集团",
        to_status: "in_use",
        to_holder_type: "user",
        to_holder_id: "u2",
      }),
    )
    expect(post).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("已完成 20 台的流转"))
  })

  // Returning names no destination by default: each device goes back to its
  // own home, which is the only answer that can differ across a batch.
  it("returns each device to its own home by default", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "归还" }))
    expect(screen.getByRole("combobox", { name: "目标" })).toHaveTextContent("各自的默认归属")
    await user.click(screen.getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "",
        to_status: "in_stock",
        check_in: true,
      }),
    )
  })

  it("keeps submit unavailable until a destination is chosen", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "转移" }))
    expect(screen.getByRole("button", { name: "提交" })).toBeDisabled()

    await chooseByLabel(user, "账号", "张三")
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled()
  })

  it("surfaces the server's reason when a transfer is refused", async () => {
    post.mockRejectedValue(
      new ApiError(422, "illegal_transition", "retired is terminal: correct a mistaken write-off by editing the tail transfer event"),
    )
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "改状态" }))
    await user.click(screen.getByRole("button", { name: "提交" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/terminal/)
  })
})

// Deleting used to be a button on every row. It belongs with the other things
// you do to a selection, and it stops the table growing a column for it.
describe("ActionBar delete", () => {
  it("asks for the size of the batch before deleting", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={twenty} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /删除/ }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("20 台设备")

    const confirm = within(dialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()
    // Typing the wrong number is not confirmation either.
    await user.type(screen.getByLabelText(/请输入/), "2")
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/请输入/), "0")
    expect(confirm).toBeEnabled()
  })

  it("sends one request for the whole selection", async () => {
    const onDone = vi.fn()
    const onClear = vi.fn()
    post.mockResolvedValue({ deleted: 20 })
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={twenty} onClear={onClear} onDone={onDone} onExport={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /删除/ }))
    const dialog = await screen.findByRole("alertdialog")
    await user.type(screen.getByLabelText(/请输入/), "20")
    await user.click(within(dialog).getByRole("button", { name: "删除" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/assets/delete", {
        asset_ids: twenty,
        confirm: "20",
      }),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("已删除 20 台设备"))
    expect(onClear).toHaveBeenCalled()
  })
})
