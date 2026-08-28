import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Import } from "@/routes/Import"
import { renderWithProviders } from "@/test/renderWithProviders"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
    getToken: () => "t0k",
  }
})

const categories = [
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: null, path: "/rt/", sn_template: "x" },
]

const fetchMock = vi.fn()
const csv = () => new File(["model,holder\n"], "assets.csv", { type: "text/csv" })

beforeEach(() => {
  get.mockReset().mockResolvedValue(categories)
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

function ok(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

async function chooseCategory(user: ReturnType<typeof userEvent.setup>) {
  // The select renders immediately; its options arrive with the query.
  await screen.findByRole("option", { name: "SDWAN 路由器" })
  await user.selectOptions(screen.getByLabelText("导入到类别"), "rt")
}

async function uploadAndPreview(user: ReturnType<typeof userEvent.setup>) {
  await chooseCategory(user)
  await user.upload(screen.getByLabelText("CSV 文件"), csv())
  await user.click(screen.getByRole("button", { name: "预览" }))
}

describe("Import page", () => {
  it("offers the template only once a category is chosen", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Import />)

    // Before a category is chosen the template is not a live link at all.
    expect(await screen.findByRole("button", { name: "下载模板" })).toBeDisabled()
    expect(screen.queryByRole("link", { name: "下载模板" })).not.toBeInTheDocument()

    await chooseCategory(user)
    expect(screen.getByRole("link", { name: "下载模板" })).toHaveAttribute(
      "href",
      "/api/categories/rt/import-template.csv",
    )
  })

  it("lists every failing line with its reason and blocks the commit", async () => {
    fetchMock.mockReturnValue(
      ok({
        total: 120,
        ok: 117,
        rows: [
          { line: 7, status: "error", fields: { mac: "MAC 格式非法：00:1A:2B:3C:4D" } },
          { line: 12, status: "error", fields: { mac: "该值已被资产 112394521950 占用" } },
          { line: 34, status: "error", fields: { holder: "找不到持有方「上海办公室-4F」" } },
        ],
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<Import />)
    await uploadAndPreview(user)

    expect(await screen.findByRole("status")).toHaveTextContent("120 行中 117 行可以导入")
    expect(screen.getByText("有 3 行需要修正，修正后重新上传")).toBeInTheDocument()

    for (const [line, reason] of [
      [7, "MAC 格式非法"],
      [12, "已被资产 112394521950 占用"],
      [34, "找不到持有方"],
    ] as [number, string][]) {
      const row = screen.getByRole("row", { name: `第 ${line} 行` })
      expect(within(row).getByText(new RegExp(reason))).toBeInTheDocument()
    }

    // Nothing may be committed while a line is still failing.
    expect(screen.getByRole("button", { name: "确认导入" })).toBeDisabled()
  })

  it("enables the commit only when every line passes", async () => {
    fetchMock.mockReturnValue(ok({ total: 3, ok: 3, rows: [] }))
    const user = userEvent.setup()
    renderWithProviders(<Import />)
    await uploadAndPreview(user)

    expect(await screen.findByText("全部 3 行校验通过")).toBeInTheDocument()
    const commit = screen.getByRole("button", { name: "确认导入" })
    expect(commit).toBeEnabled()

    fetchMock.mockReturnValue(ok({ total: 3, ok: 3, rows: [] }, 201))
    await user.click(commit)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("已导入 3 台设备"))
  })

  it("sends the category and the file as one upload", async () => {
    fetchMock.mockReturnValue(ok({ total: 1, ok: 1, rows: [] }))
    const user = userEvent.setup()
    renderWithProviders(<Import />)
    await uploadAndPreview(user)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/import/preview", expect.any(Object)))
    const [, init] = fetchMock.mock.calls[0]
    const body = (init as { body: FormData }).body
    expect(body.get("category_id")).toBe("rt")
    expect((body.get("file") as File).name).toBe("assets.csv")
  })

  // A refused commit still carries the report, so the lines stay on screen.
  it("keeps showing the offending lines when the commit is refused", async () => {
    fetchMock.mockReturnValueOnce(ok({ total: 2, ok: 2, rows: [] }))
    const user = userEvent.setup()
    renderWithProviders(<Import />)
    await uploadAndPreview(user)
    await screen.findByText("全部 2 行校验通过")

    fetchMock.mockReturnValueOnce(
      ok(
        {
          error: { code: "validation_failed", message: "有 1 行未通过校验，本次导入未写入任何数据" },
          report: { total: 2, ok: 1, rows: [{ line: 4, status: "error", fields: { mac: "已被占用" } }] },
        },
        422,
      ),
    )
    await user.click(screen.getByRole("button", { name: "确认导入" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("未写入任何数据")
    expect(screen.getByRole("row", { name: "第 4 行" })).toBeInTheDocument()
  })
})
