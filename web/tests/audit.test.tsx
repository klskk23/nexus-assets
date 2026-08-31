import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Audit } from "@/routes/Audit"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return { ...actual, api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() } }
})

interface AuditEntry {
  id: number
  actor_name: string
  action: string
  target_type: string
  target_id: string
  before?: unknown
  after?: unknown
  created_at: string
}

const entries: AuditEntry[] = [
  {
    id: 2,
    actor_name: "管理员",
    action: "update",
    target_type: "field",
    target_id: "sn",
    before: { options: { template: "{{ .attrs.mac | hex2dec }}" } },
    after: { options: { template: '{{ printf "%s-%s" .category.code .attrs.mac }}' } },
    created_at: "2026-08-28T09:00:00Z",
  },
  {
    id: 1,
    actor_name: "张三",
    action: "create",
    target_type: "field",
    target_id: "f1",
    after: { key: "mac" },
    created_at: "2026-08-27T09:00:00Z",
  },
]

function page(items: AuditEntry[] = entries) {
  return { items, total: items.length, offset: 0, limit: 50 }
}

beforeEach(() => {
  get.mockReset().mockResolvedValue(page())
})

describe("Audit page", () => {
  it("shows who did what, to which kind of object, and when", async () => {
    renderWithProviders(<Audit />)
    const row = await screen.findByRole("row", { name: /管理员/ })
    expect(within(row).getByText("修改")).toBeInTheDocument()
    expect(within(row).getByText("字段")).toBeInTheDocument()
  })

  it("filters by target type", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Audit />)
    await screen.findByRole("row", { name: /管理员/ })

    await chooseByLabel(user, "对象类型", "字段")
    await waitFor(() => expect(get).toHaveBeenCalledWith("/audit?target_type=field"))
  })

  it("turns a date range into the RFC3339 the API expects", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Audit />)
    await screen.findByRole("row", { name: /管理员/ })

    await user.type(screen.getByLabelText("起始时间"), "2026-08-01")
    await user.type(screen.getByLabelText("结束时间"), "2026-08-28")

    await waitFor(() => {
      const last = get.mock.calls[get.mock.calls.length - 1][0] as string
      const params = new URLSearchParams(last.split("?")[1])
      // The end of the range has to cover the whole day, or today's entries
      // vanish the moment someone filters "up to today".
      expect(params.get("from")).toBe("2026-08-01T00:00:00Z")
      expect(params.get("to")).toBe("2026-08-28T23:59:59Z")
    })
  })

  // Knowing what the rule said before is what makes the entry worth keeping.
  it("reveals the before and after values on demand", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Audit />)
    const row = await screen.findByRole("row", { name: /管理员/ })

    expect(screen.queryByText(/hex2dec/)).not.toBeInTheDocument()
    await user.click(within(row).getByRole("button", { name: "查看前后值" }))

    expect(await screen.findByText("变更前")).toBeInTheDocument()
    expect(screen.getByText(/hex2dec/)).toBeInTheDocument()
    expect(screen.getByText(/category\.code/)).toBeInTheDocument()
  })

  it("offers no expander for an entry with nothing recorded", async () => {
    get.mockResolvedValue(
      page([{ id: 3, actor_name: "管理员", action: "delete", target_type: "user", target_id: "u9", created_at: "2026-08-28T09:00:00Z" }]),
    )
    renderWithProviders(<Audit />)
    await screen.findByRole("row", { name: /管理员/ })
    expect(screen.queryByRole("button", { name: "查看前后值" })).not.toBeInTheDocument()
  })

  it("shows an empty state rather than a blank table", async () => {
    get.mockResolvedValue(page([]))
    renderWithProviders(<Audit />)
    expect(await screen.findByText("还没有配置变更记录")).toBeInTheDocument()
  })
})
