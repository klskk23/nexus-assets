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

/** The dry run answers first, then the real submission. */
function plans(dry: unknown, real: unknown) {
  post.mockImplementation((_p: string, body: { dry_run?: boolean }) =>
    Promise.resolve(body?.dry_run ? dry : real),
  )
}

beforeEach(() => {
  get.mockReset().mockImplementation(route(true))
  post.mockReset()
  plans(
    { batches: [{ category_id: "net", category_name: "网络设备", count: 2, preset_name: "路由器标签" }] },
    { batches: [{ category_id: "net", category_name: "网络设备", count: 2, job_id: "job-1", status: "queued" }] },
  )
})

describe("printing the ticked devices", () => {
  it("offers nothing when no print service is configured", async () => {
    get.mockImplementation(route(false))
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await screen.findByText(/已选/)
    expect(screen.queryByRole("button", { name: "打印标签" })).not.toBeInTheDocument()
  })

  // Paper comes out of a machine in another room, so opening the dialog must
  // not print anything: it says what would come out and waits to be told.
  it("asks before it prints, and prints nothing until it is told to", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/print", { ids: ["a1", "a2"], dry_run: true }),
    )

    const dialog = await screen.findByRole("dialog")
    // What is about to be spent: how many, under which label design.
    expect(within(dialog).getByText("路由器标签")).toBeInTheDocument()
    expect(await within(dialog).findByRole("button", { name: "确认打印 2 张" })).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    // Nothing has been asked about a job, because there is no job.
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("/print/jobs/"))
  })

  it("prints, and watches until the labels are out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(await within(dialog).findByRole("button", { name: "确认打印 2 张" }))

    await waitFor(() => expect(post).toHaveBeenCalledWith("/print", { ids: ["a1", "a2"] }))
    expect(within(dialog).getByText("网络设备")).toBeInTheDocument()
    // Watched, not fired and forgotten: the service accepts a job and answers
    // immediately, so everything that can go wrong happens after the reply.
    await waitFor(() => expect(get).toHaveBeenCalledWith("/print/jobs/job-1"))
    expect(await within(dialog).findByText("已完成")).toBeInTheDocument()
    expect(await within(dialog).findByText("全部打印完成")).toBeInTheDocument()
  })

  // Much better learned before the press than after it: the confirmation
  // already knows this category cannot print, and says so while the roll is
  // still full.
  it("says which category has no label before anything is printed", async () => {
    const both = {
      batches: [
        { category_id: "net", category_name: "网络设备", count: 1, preset_name: "路由器标签" },
        { category_id: "srv", category_name: "服务器", count: 1, error: "类别「服务器」还没有指定打印预设" },
      ],
    }
    plans(both, both)
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")

    // The split is visible: two categories, two rows, one of them unprintable.
    expect(within(dialog).getByText(/2 台设备，2 个类别/)).toBeInTheDocument()
    expect(within(dialog).getByText(/还没有指定打印预设/)).toBeInTheDocument()
    // And the button counts only what can actually come out.
    expect(await within(dialog).findByRole("button", { name: "确认打印 1 张" })).toBeInTheDocument()
  })

  it("reports a job that failed at the printer", async () => {
    get.mockImplementation(route(true, { status: "failed", failureMessage: "缺纸" }))
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(await within(dialog).findByRole("button", { name: /确认打印/ }))
    expect(await within(dialog).findByText("失败")).toBeInTheDocument()
    expect(within(dialog).getByText("缺纸")).toBeInTheDocument()
  })

  // Numbers minted in the print service are invisible here unless said aloud.
  it("shows the sequence numbers a job consumed", async () => {
    plans(
      { batches: [{ category_id: "net", category_name: "网络设备", count: 8 }] },
      {
        batches: [
          {
            category_id: "net", category_name: "网络设备", count: 8,
            job_id: "job-1", status: "queued",
            claims: [{ poolId: "p1", variableName: "seq", start: 1001, end: 1008 }],
          },
        ],
      },
    )
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(await within(dialog).findByRole("button", { name: /确认打印/ }))
    expect(await within(dialog).findByText(/消耗序号 seq：1001–1008/)).toBeInTheDocument()
  })
})
