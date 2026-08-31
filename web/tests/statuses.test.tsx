import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Statuses } from "@/routes/Statuses"
import { renderWithProviders } from "@/test/renderWithProviders"
import { choose } from "@/test/choose"
import { chooseFromMenu, openMenu } from "@/test/menu"
import { statusList } from "./fixtures/statuses"
import type { Status, StatusUsage } from "@/lib/types"

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: (p: string) => del(p),
    },
  }
})

const onLoan = {
  key: "on_loan",
  label: "外借中",
  color: "violet",
  sort: 60,
  builtin: false,
  counts_as_available: true,
  terminal: false,
}

const withCustom: Status[] = [...statusList, onLoan]

function route(usage: Record<string, StatusUsage> = {}) {
  return (p: string) =>
    Promise.resolve(p === "/status-usage" ? usage : withCustom)
}

beforeEach(() => {
  get.mockReset().mockImplementation(route())
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

describe("Statuses page", () => {
  it("lists every status with its kind and behaviour", async () => {
    renderWithProviders(<Statuses />)

    expect(await screen.findByText("在库")).toBeInTheDocument()
    const row = screen.getByText("在库").closest("tr") as HTMLElement
    expect(within(row).getByText("in_stock")).toBeInTheDocument()
    expect(within(row).getByText("内置")).toBeInTheDocument()

    const retired = screen.getByText("已报废").closest("tr") as HTMLElement
    expect(within(retired).getByText("终态")).toBeInTheDocument()
    expect(within(retired).getByText("不计入类别分布")).toBeInTheDocument()
  })

  it("colours each badge from the palette slot the status carries", async () => {
    renderWithProviders(<Statuses />)

    const badge = await screen.findByText("在库")
    expect(badge).toHaveClass("status-green")
    expect(screen.getByText("丢失")).toHaveClass("status-red")
    expect(screen.getByText("外借中")).toHaveClass("status-violet")
  })

  // A built-in carries behaviour the system is written against. The action is
  // offered and disabled rather than missing: "why is there no delete" is a
  // worse question than a greyed-out row.
  it("disables delete on a built-in status, enables it on a custom one", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Statuses />)

    await screen.findByText("在库")
    await openMenu(user, screen.getByText("在库").closest("tr") as HTMLElement)
    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute("aria-disabled", "true")
    await user.keyboard("{Escape}")

    await openMenu(user, screen.getByText("外借中").closest("tr") as HTMLElement)
    expect(screen.getByRole("menuitem", { name: "删除" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })


  it("recolours a status from the editor the row opens", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Statuses />)

    await user.click(await screen.findByRole("row", { name: /外借中/ }))
    const dialog = await screen.findByRole("dialog")
    await choose(user, within(dialog).getByLabelText("颜色"), "青")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/statuses/on_loan", { label: "外借中", color: "teal" }),
    )
  })

  it("creates a status with the behaviour switches it was given", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Statuses />)

    await user.click(await screen.findByRole("button", { name: "新建状态" }))
    await user.type(screen.getByLabelText("键名"), "on_loan")
    await user.type(screen.getByLabelText("显示名"), "外借中")
    await choose(user, screen.getByLabelText("颜色"), "紫")
    await user.click(screen.getByLabelText("终态"))

    await user.click(screen.getByRole("button", { name: "新建状态", hidden: false }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/statuses", {
        key: "on_loan",
        label: "外借中",
        color: "violet",
              counts_as_available: true,
        terminal: true,
      }),
    )
  })

  it("states how many events mention a status before it is deleted", async () => {
    const user = userEvent.setup()
    get.mockImplementation(route({ on_loan: { assets: 0, history: 4 } }))
    renderWithProviders(<Statuses />)

    await screen.findByText("外借中")
    const row = screen.getByText("外借中").closest("tr") as HTMLElement
    expect(within(row).getByText(/历史 4 条/)).toBeInTheDocument()

    await chooseFromMenu(user, row, "删除")
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("4 条流转记录")
    // Deleting is only armed once the key has been typed out.
    const confirm = within(dialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByRole("textbox"), "on_loan")
    await user.click(confirm)
    await waitFor(() => expect(del).toHaveBeenCalledWith("/statuses/on_loan"))
  })

  it("surfaces a refusal above the table rather than inside the create dialog", async () => {
    const user = userEvent.setup()
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
    del.mockRejectedValue(
      new ApiError(409, "reference_blocked", "还有 3 台设备处于「外借中」，请先把它们改到别的状态"),
    )
    renderWithProviders(<Statuses />)

    await screen.findByText("外借中")
    const row = screen.getByText("外借中").closest("tr") as HTMLElement
    await chooseFromMenu(user, row, "删除")
    const dialog = await screen.findByRole("alertdialog")
    await user.type(within(dialog).getByRole("textbox"), "on_loan")
    await user.click(within(dialog).getByRole("button", { name: "删除" }))

    expect(await screen.findByText(/还有 3 台设备/)).toBeInTheDocument()
  })
})
