import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"

import { TransferChange } from "@/features/transfers/TransferChange"
import type { Transfer } from "@/lib/transferTypes"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  }
})

// The chips resolve their labels and colours through /statuses; answering that
// route with anything else is how a test ends up throwing inside StatusBadge
// rather than failing an assertion.
beforeEach(() => {
  get.mockReset().mockImplementation((p: string) => statusRoute(p) ?? Promise.resolve([]))
})

const zhang = { id: "u-zhang", email: "z@x.com", name: "张三", auth_type: "local", status: "active" }
const li = { id: "u-li", email: "l@x.com", name: "李四", auth_type: "local", status: "active" }

const base: Transfer = {
  id: "t1",
  asset_id: "a-1",
  batch_id: null,
  kind: "transfer",
  from_status: "in_use",
  from_holder: { type: "user", id: "u-zhang", name: "张三" },
  from_owner_id: "u-zhang",
  from_owner: zhang as never,
  to_status: "in_use",
  to_holder: { type: "user", id: "u-zhang", name: "张三" },
  to_owner_id: "u-zhang",
  to_owner: zhang as never,
  due_at: null,
  created_at: "2026-09-01T09:00:00Z",
  edited_at: null,
  edited_by: null,
}

function show(event: Transfer) {
  return renderWithProviders(<TransferChange event={event} />)
}

/**
 * A reassignment is the one event whose entire content is the owner.
 *
 * It changes neither the holder nor the status, so the cell used to draw an
 * arrow from a name to the same name and stop there -- a row that says a device
 * moved when it did not, with the thing that actually changed nowhere on it.
 * The reader has no way to tell that from a broken page.
 */
describe("流转的变更内容", () => {
  it("负责人变了就写出流向", () => {
    show({ ...base, kind: "reassign", to_owner_id: "u-li", to_owner: li as never })

    expect(screen.getByText("负责人")).toBeInTheDocument()
    expect(screen.getByText("张三")).toBeInTheDocument()
    expect(screen.getByText("李四")).toBeInTheDocument()
  })

  // Nothing else moved, so nothing else is drawn. The holder pair rendered
  // anyway was the misleading half: two identical names with an arrow between
  // them.
  it("负责人变更不画持有方那条", () => {
    const { container } = show({
      ...base,
      kind: "reassign",
      to_owner_id: "u-li",
      to_owner: li as never,
    })

    // 张三 appears once -- as the old owner, not also as a holder pointing at
    // itself.
    expect(screen.getAllByText("张三")).toHaveLength(1)
    expect(container.querySelectorAll("svg")).toHaveLength(1)
  })

  // The common case is unchanged: a movement that does change hands still reads
  // as one line, and does not grow an owner line saying the owner stayed put.
  it("只换持有方时不提负责人", () => {
    show({
      ...base,
      to_holder: { type: "user", id: "u-li", name: "李四" },
    })

    expect(screen.queryByText("负责人")).not.toBeInTheDocument()
    expect(screen.getByText("张三")).toBeInTheDocument()
    expect(screen.getByText("李四")).toBeInTheDocument()
  })

  it("两样一起变就两条都写", () => {
    show({
      ...base,
      kind: "checkout",
      from_status: "in_stock",
      to_holder: { type: "user", id: "u-li", name: "李四" },
      to_owner_id: "u-li",
      to_owner: li as never,
    })

    expect(screen.getByText("负责人")).toBeInTheDocument()
    expect(screen.getAllByText("张三")).toHaveLength(2)
    expect(screen.getAllByText("李四")).toHaveLength(2)
  })

  // The first record has no "from" on either leg: a destination alone, never an
  // arrow out of nothing.
  it("录入那条只写目的地", () => {
    const { container } = show({
      ...base,
      kind: "create",
      from_status: null,
      from_holder: null,
      from_owner_id: null,
      from_owner: null,
    })

    expect(screen.getByText("负责人")).toBeInTheDocument()
    expect(container.querySelectorAll("svg")).toHaveLength(0)
  })

  /**
   * A deleted account leaves its id on the record and no name to print.
   *
   * The id is what the ledger actually holds, so it is what gets shown -- a
   * blank there would turn "handed over by somebody who has since left" into
   * "handed over by nobody", which is a different and false statement.
   */
  it("账号已删时退回 id，不留白", () => {
    show({
      ...base,
      kind: "reassign",
      to_owner_id: "u-gone",
      to_owner: null,
    })

    expect(screen.getByText("u-gone")).toBeInTheDocument()
  })
})
