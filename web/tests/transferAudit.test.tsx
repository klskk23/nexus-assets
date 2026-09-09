import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TransferAudit } from "@/routes/TransferAudit"
import type { Transfer } from "@/lib/transferTypes"
import { renderWithProviders } from "@/test/renderWithProviders"
import { tAudit } from "@/i18n"
import { statusRoute } from "./fixtures/statuses"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  }
})

const users = [
  { id: "u-admin", email: "a@x.com", name: "管理员", auth_type: "local", status: "active" },
  { id: "u-zhang", email: "z@x.com", name: "张三", auth_type: "local", status: "active" },
]

const movements: Transfer[] = [
  {
    id: "t2",
    asset_id: "a-1",
    batch_id: null,
    kind: "checkout",
    from_status: "in_stock",
    from_holder: null,
    from_owner_id: null,
    to_status: "in_use",
    to_holder: { type: "user", id: "u-zhang", name: "张三" },
    to_owner_id: "u-zhang",
    due_at: null,
    actor: users[0] as never,
    asset_display_name: "NX-0042",
    created_at: "2026-08-28T09:00:00Z",
    edited_at: null,
    edited_by: null,
  },
]

function serve(items: Transfer[] = movements) {
  get.mockImplementation(
    (path: string) =>
      // The status chips resolve their labels and colours through /statuses,
      // and answering that route with a list envelope is how this page ends up
      // throwing inside StatusBadge rather than failing an assertion.
      statusRoute(path) ??
      Promise.resolve(
        path.startsWith("/users") ? users : { items, total: items.length, offset: 0, limit: 20 },
      ),
  )
}

/** The parameters of the most recent movement request -- the page also asks
 * for the account list, which must not be mistaken for one. */
function lastCall(): URLSearchParams {
  const calls = get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/transfers"))
  return new URLSearchParams(calls[calls.length - 1].split("?")[1])
}

beforeEach(() => {
  get.mockReset()
  serve()
})

describe("流转审计页", () => {
  it("每行说出是哪台设备，并且能点进去", async () => {
    renderWithProviders(<TransferAudit />, { permissions: ["audit.read", "transfer.audit"] })
    const link = await screen.findByRole("link", { name: "NX-0042" })
    expect(link).toHaveAttribute("href", "/assets/a-1")
  })

  // In a cell the number is a value to match character by character against a
  // label in somebody's hand, and the display face makes that slower. On the
  // detail page the same number IS the page's title and keeps font-heading --
  // the split is title versus cell, not identifier versus quantity.
  it("表格里的资产编号用普通字体，不挂 font-heading", async () => {
    renderWithProviders(<TransferAudit />, { permissions: ["audit.read", "transfer.audit"] })
    const link = await screen.findByRole("link", { name: "NX-0042" })
    expect(link.className).not.toContain("font-heading")
    // Tabular figures stay: the digits still have to line up down the column.
    expect(link.className).toContain("tabular-nums")
  })

  // Every other paired page in this product puts its tab strip on the title
  // row. On its own line it read as a second heading under the first and cost
  // the table a whole band of height.
  it("页签和标题在同一行里", async () => {
    renderWithProviders(<TransferAudit />, { permissions: ["audit.read", "transfer.audit"] })
    const heading = await screen.findByRole("heading", { name: new RegExp(tAudit.movementsTitle) })
    const row = heading.parentElement as HTMLElement
    expect(within(row).getByRole("tab", { name: tAudit.tabMovements })).toBeInTheDocument()
  })

  it("流转审计排在操作审计前面", async () => {
    renderWithProviders(<TransferAudit />, { permissions: ["audit.read", "transfer.audit"] })
    await screen.findByRole("tab", { name: tAudit.tabMovements })
    const labels = screen.getAllByRole("tab").map((el) => el.textContent)
    expect(labels).toEqual([tAudit.tabMovements, tAudit.tabOperations])
  })

  it("按编号筛选走服务端，模糊匹配交给它", async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransferAudit />, { permissions: ["transfer.audit"] })
    await screen.findByRole("link", { name: "NX-0042" })

    await user.type(screen.getByPlaceholderText(tAudit.assetNumberPlaceholder), "0042")
    await waitFor(() => expect(lastCall().get("asset_number")).toBe("0042"))
  })

  it("筛空了就说出来，而不是一张空表", async () => {
    serve([])
    const user = userEvent.setup()
    renderWithProviders(<TransferAudit />, { permissions: ["transfer.audit"] })

    await user.type(screen.getByPlaceholderText(tAudit.assetNumberPlaceholder), "zzzz")
    expect(await screen.findByText(tAudit.movementsEmptyFiltered)).toBeInTheDocument()
  })
})
