import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ActionBar } from "@/features/assets/ActionBar"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"

const get = vi.fn()
const post = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: vi.fn(),
      del: vi.fn(),
    },
  }
})

/** Answers the queries the bar and the dialog make. */
function route(printing: boolean, job: Record<string, unknown> = { status: "completed" }) {
  return (p: string) => {
    const st = statusRoute(p)
    if (st) return st
    if (p === "/capabilities") return Promise.resolve({ printing })
    if (p.startsWith("/print/jobs/")) return Promise.resolve(job)
    return Promise.resolve([])
  }
}

beforeEach(() => {
  get.mockReset().mockImplementation(route(true))
  post.mockReset().mockResolvedValue({
    batches: [
      { category_id: "net", category_name: "网络设备", count: 2, job_id: "job-1", status: "queued" },
    ],
  })
})

describe("printing the ticked devices", () => {
  it("offers nothing when no print service is configured", async () => {
    get.mockImplementation(route(false))
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await screen.findByText(/已选/)
    expect(screen.queryByRole("button", { name: "打印标签" })).not.toBeInTheDocument()
  })

  it("sends the selection and watches until the labels are out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/print", { ids: ["a1", "a2"] }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("网络设备")).toBeInTheDocument()
    // Watched, not fired and forgotten: the service accepts a job and answers
    // immediately, so everything that can go wrong happens after the reply.
    await waitFor(() => expect(get).toHaveBeenCalledWith("/print/jobs/job-1"))
    expect(await within(dialog).findByText("已完成")).toBeInTheDocument()
    expect(await within(dialog).findByText("全部打印完成")).toBeInTheDocument()
  })

  it("says which category has no label rather than reporting a printer fault", async () => {
    post.mockResolvedValue({
      batches: [
        { category_id: "net", category_name: "网络设备", count: 1, job_id: "job-1", status: "queued" },
        { category_id: "srv", category_name: "服务器", count: 1, error: "类别「服务器」还没有指定打印预设" },
      ],
    })
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")

    // The split is visible: two categories, two rows, one of them unprintable.
    expect(within(dialog).getByText(/2 台设备，2 个类别/)).toBeInTheDocument()
    expect(within(dialog).getByText(/还没有指定打印预设/)).toBeInTheDocument()
    expect(await within(dialog).findByText("有作业没有完成，详见下表")).toBeInTheDocument()
  })

  it("reports a job that failed at the printer", async () => {
    get.mockImplementation(route(true, { status: "failed", failureMessage: "缺纸" }))
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText("失败")).toBeInTheDocument()
    expect(within(dialog).getByText("缺纸")).toBeInTheDocument()
  })

  // Numbers minted in the print service are invisible here unless said aloud.
  it("shows the sequence numbers a job consumed", async () => {
    post.mockResolvedValue({
      batches: [
        {
          category_id: "net", category_name: "网络设备", count: 8,
          job_id: "job-1", status: "queued",
          claims: [{ poolId: "p1", variableName: "seq", start: 1001, end: 1008 }],
        },
      ],
    })
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText(/消耗序号 seq：1001–1008/)).toBeInTheDocument()
  })
})
