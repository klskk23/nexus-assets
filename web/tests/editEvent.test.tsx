import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { EditEvent } from "@/features/transfers/EditEvent"
import type { Transfer } from "@/lib/transferTypes"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"

const get = vi.fn()
const patch = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn(),
      patch: (p: string, b: unknown) => patch(p, b),
      del: vi.fn(),
    },
  }
})

const users = [
  { id: "u1", email: "a@x.com", name: "管理员", auth_type: "local", status: "active" },
  { id: "u2", email: "z@x.com", name: "张三", auth_type: "local", status: "active" },
]

const event: Transfer = {
  id: "t9",
  asset_id: "a1",
  batch_id: null,
  kind: "checkout",
  from_status: "in_stock",
  from_holder: { type: "entity", id: "loc", name: "上海仓库" },
  from_owner_id: null,
  to_status: "in_use",
  to_holder: { type: "user", id: "u1", name: "管理员" },
  to_owner_id: "u1",
  due_at: null,
  created_at: "2026-09-01T09:00:00Z",
  edited_at: null,
  edited_by: null,
}

beforeEach(() => {
  patch.mockReset().mockResolvedValue([event])
  get.mockReset().mockImplementation((p: string) => {
    const st = statusRoute(p)
    if (st) return st
    if (p === "/users") return Promise.resolve(users)
    return Promise.resolve([])
  })
})

/**
 * The server has always accepted a corrected owner here; the form never sent
 * one.
 *
 * So a movement filed against the wrong person could only be answered with a
 * second movement -- inventing an event that never happened in order to fix
 * one that did, in the one table the ledger keeps precisely so that what
 * happened stays readable.
 */
describe("更正最新的一条流转", () => {
  it("能改负责人，并把它一起提交", async () => {
    const u = userEvent.setup()
    renderWithProviders(<EditEvent event={event} assetID="a1" onClose={() => {}} />)

    await u.click(await screen.findByRole("combobox", { name: "负责人" }))
    await u.click(await screen.findByRole("option", { name: "张三" }))
    await u.click(screen.getByRole("button", { name: "保存修改" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/transfers/t9",
        expect.objectContaining({ to_owner_id: "u2" }),
      ),
    )
  })

  // Unchanged fields still travel: the endpoint reads an absent field as
  // "leave it alone", so sending only what was touched would be right -- but
  // the form has no way to know what was touched, and a correction that
  // silently drops the holder it is showing is worse than one that restates
  // it.
  it("没动的字段照原样带上", async () => {
    const u = userEvent.setup()
    renderWithProviders(<EditEvent event={event} assetID="a1" onClose={() => {}} />)

    await u.click(await screen.findByRole("button", { name: "保存修改" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/transfers/t9",
        expect.objectContaining({ to_holder_id: "u1", to_owner_id: "u1" }),
      ),
    )
  })
})
