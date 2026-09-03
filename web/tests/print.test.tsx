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
    if (p === "/capabilities") {
      return Promise.resolve({ printing, printing_url: printing ? "http://printer:3000" : "" })
    }
    if (p.startsWith("/print/jobs/")) return Promise.resolve(job)
    return Promise.resolve([])
  }
}

/** The dry run answers first, then the real submission. */
function plans(dry: unknown, real: unknown, sources: unknown = { sources: [] }) {
  post.mockImplementation((p: string, body: { dry_run?: boolean }) => {
    if (p === "/print/refresh-source") return Promise.resolve(sources)
    return Promise.resolve(body?.dry_run ? dry : real)
  })
}

beforeEach(() => {
  get.mockReset().mockImplementation(route(true))
  post.mockReset()
  plans(
    {
      batches: [
        {
          category_id: "net", category_name: "网络设备", count: 2,
          preset_name: "路由器标签", numbers: ["112394521950", "112394521951"],
          preset_id: "p1",
          presets: [{ id: "p1", name: "路由器标签", templateId: "tpl-1" }],
        },
      ],
    },
    { batches: [{ category_id: "net", category_name: "网络设备", count: 2, job_id: "job-1", status: "queued" }] },
  )
})

describe("printing the ticked devices", () => {
  it("offers nothing when no print service is configured", async () => {
    get.mockImplementation(route(false))
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await screen.findByText(/已选/)
    expect(screen.queryByRole("button", { name: "打印标签" })).not.toBeInTheDocument()
  })

  // Paper comes out of a machine in another room, so opening the dialog must
  // not print anything: it says what would come out and waits to be told.
  it("asks before it prints, and prints nothing until it is told to", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/print", { ids: ["a1", "a2"], dry_run: true }),
    )

    const dialog = await screen.findByRole("dialog")
    // What is about to be spent: how many, under which label design, and --
    // the part that can actually be checked against the devices on the bench --
    // which numbers.
    expect(within(dialog).getByText("路由器标签")).toBeInTheDocument()
    expect(within(dialog).getByText(/112394521950\s+112394521951/)).toBeInTheDocument()
    expect(await within(dialog).findByRole("button", { name: "确认打印 2 张" })).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    // Nothing has been asked about a job, because there is no job.
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("/print/jobs/"))
  })

  it("prints, and watches until the labels are out", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(await within(dialog).findByRole("button", { name: "确认打印 2 张" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/print", { ids: ["a1", "a2"], presets: { net: "p1" } }),
    )
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
    renderWithProviders(<ActionBar selected={["a1", "a2"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

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
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

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
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(await within(dialog).findByRole("button", { name: /确认打印/ }))
    expect(await within(dialog).findByText(/消耗序号 seq：1001–1008/)).toBeInTheDocument()
  })
})

// One device carries more than one label -- a permanent number, and a location
// tag replaced whenever it moves -- so which one is a decision taken here,
// where the paper is about to come out.
describe("choosing which label", () => {
  it("asks when a category has several, and sends the choice", async () => {
    plans(
      {
        batches: [
          {
            category_id: "net", category_name: "网络设备", count: 1,
            preset_id: "p-sn", preset_name: "编号标签",
            presets: [
              { id: "p-sn", name: "编号标签", templateId: "tpl-sn" },
              { id: "p-loc", name: "位置标签", templateId: "tpl-loc" },
            ],
            numbers: ["112394521950"],
          },
        ],
      },
      { batches: [{ category_id: "net", category_name: "网络设备", count: 1, job_id: "job-1", status: "queued" }] },
    )
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")

    const picker = await within(dialog).findByRole("combobox", { name: /网络设备/ })
    // The first is proposed rather than left blank; a printer with one obvious
    // answer should not stop to ask.
    expect(picker).toHaveTextContent("编号标签")
    await user.click(picker)
    await user.click(await screen.findByRole("option", { name: "位置标签" }))

    // The way out to the print service follows the choice on screen, not the
    // one proposed before anybody touched the list.
    expect(
      within(dialog).getByRole("link", { name: "在打印服务里打开这张标签" }),
    ).toHaveAttribute("href", "http://printer:3000/design/tpl-loc?preset=p-loc")

    await user.click(within(dialog).getByRole("button", { name: /确认打印/ }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/print", {
        ids: ["a1"],
        presets: { net: "p-loc" },
      }),
    )
  })

  it("does not ask when there is only one label", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("路由器标签")
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument()
  })
})

// "every job has finished" is vacuously true before there are any jobs, and the
// dialog used to say so above the button that had not been pressed yet.
it("does not claim the labels printed before they were", async () => {
  const user = userEvent.setup()
  renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

  await user.click(await screen.findByRole("button", { name: "打印标签" }))
  const dialog = await screen.findByRole("dialog")
  await within(dialog).findByRole("button", { name: /确认打印/ })

  expect(within(dialog).queryByText("全部打印完成")).not.toBeInTheDocument()
})

// Nothing here designs a label. When one is wrong, the only useful thing this
// page can offer is the way over to where it can be fixed.
describe("getting to the print service", () => {
  it("links to where labels are managed, and to the label itself", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")

    const manage = within(dialog).getByRole("link", { name: /去打印服务管理标签/ })
    expect(manage).toHaveAttribute("href", "http://printer:3000/print-presets")
    expect(manage).toHaveAttribute("target", "_blank")

    // The label's own name is the link to its design: "this one looks wrong"
    // is only actionable if it lands on the thing itself.
    expect(within(dialog).getByRole("link", { name: "路由器标签" })).toHaveAttribute(
      "href",
      "http://printer:3000/design/tpl-1?preset=p1",
    )
  })

  // The designer over there draws from the print service's own copy of these
  // rows, which is only as fresh as the last time somebody pressed refresh in
  // its interface.
  it("has the print service re-read the category before the label opens", async () => {
    plans(
      {
        batches: [
          {
            category_id: "net",
            category_name: "网络设备",
            count: 2,
            preset_name: "路由器标签",
            numbers: ["112394521950"],
            preset_id: "p1",
            presets: [{ id: "p1", name: "路由器标签", templateId: "tpl-1" }],
          },
        ],
      },
      { batches: [] },
      { sources: [{ id: "ds-1", name: "网络设备", rows: 42 }] },
    )
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("link", { name: "路由器标签" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/print/refresh-source", { category_id: "net" }),
    )
    // Said here, because this is the screen being looked at while the other
    // tab loads.
    expect(await within(dialog).findByRole("status")).toHaveTextContent("42 行")
  })

  // Nobody has to connect a table over there, and a page that says nothing
  // leaves "why is it showing yesterday's holder" unanswerable.
  it("says when no table over there reads from this category", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("link", { name: "路由器标签" }))

    expect(await within(dialog).findByRole("status")).toHaveTextContent("没有连接这个类别的数据源")
  })

  // Once something has gone wrong at the printer, the useful place is the
  // queue -- which is also where a paused one has to be released.
  it("points at the queue after a failure", async () => {
    get.mockImplementation(route(true, { status: "failed", failureMessage: "缺纸" }))
    const user = userEvent.setup()
    renderWithProviders(<ActionBar selected={["a1"]} onClear={vi.fn()} onDone={vi.fn()} onExport={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "打印标签" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(await within(dialog).findByRole("button", { name: /确认打印/ }))
    await within(dialog).findByText("失败")

    expect(within(dialog).getByRole("link", { name: /去打印服务看队列/ })).toHaveAttribute(
      "href",
      "http://printer:3000/queue",
    )
  })
})
