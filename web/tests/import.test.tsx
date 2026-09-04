import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Import } from "@/routes/Import"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"
import { stubDownloads } from "@/test/downloads"

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
      // The real one: the upload goes through the client now, and what these
      // tests assert is the request it makes.
      upload: actual.api.upload,
    },
    getToken: () => "t0k",
  }
})

const categories = [
  { id: "rt", code: "RT", name: "SDWAN 路由器", parent_id: null, path: "/rt/", display_key: "" },
]

const fetchMock = vi.fn()
const csv = () => new File(["model,holder\n"], "assets.csv", { type: "text/csv" })

beforeEach(() => {
  get.mockReset().mockResolvedValue(categories)
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

function ok(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    // The client reads the body as text and parses it, so that a response
    // which is not JSON at all -- a proxy's own error page -- is still an
    // error it can describe.
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

async function chooseCategory(user: ReturnType<typeof userEvent.setup>) {
  await chooseByLabel(user, "导入到类别", "SDWAN 路由器")
}

async function uploadAndPreview(user: ReturnType<typeof userEvent.setup>) {
  await chooseCategory(user)
  await user.upload(screen.getByLabelText("CSV 文件"), csv())
  await user.click(screen.getByRole("button", { name: "预览" }))
}

describe("Import page", () => {
  it("offers the template only once a category is chosen", async () => {
    const dl = stubDownloads()
    try {
      const user = userEvent.setup()
      renderWithProviders(<Import />)

      expect(await screen.findByRole("button", { name: "下载模板" })).toBeDisabled()

      await chooseCategory(user)
      const button = screen.getByRole("button", { name: "下载模板" })
      expect(button).toBeEnabled()

      // Fetched, not linked: a download navigation carries no Authorization
      // header, which the browser reports as a download that simply failed.
      await user.click(button)
      await waitFor(() => expect(dl.urls).toContain("/api/categories/rt/import-template.csv"))
      expect(dl.saved).toHaveLength(1)
    } finally {
      dl.restore()
    }
  })

  // Reported as "the preview is dead": a file was chosen, the button stayed
  // grey, and the reason lived in the card above with nothing pointing at it.
  it("says why the preview is unavailable until a category is chosen", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Import />)

    expect(await screen.findByText(/先在第 1 步选好类别/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "预览" })).toBeDisabled()

    await chooseCategory(user)
    await waitFor(() =>
      expect(screen.queryByText(/先在第 1 步选好类别/)).not.toBeInTheDocument(),
    )
  })

  // An import is a long session with a file picker in the middle of it, which
  // is precisely where a fifteen-minute token runs out. It used to be the one
  // request that did not renew: the upload had its own fetch beside the client.
  it("renews an expired session and sends the file again", async () => {
    let expired = true
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/auth/refresh")) return ok({ token: "fresh" })
      if (expired) {
        expired = false
        return ok({ error: { code: "unauthenticated", message: "登录状态已失效" } }, 401)
      }
      return ok({ total: 3, ok: 3, rows: [] })
    })

    const user = userEvent.setup()
    renderWithProviders(<Import />)
    await uploadAndPreview(user)

    expect(await screen.findByText("全部 3 行校验通过")).toBeInTheDocument()
    const previews = fetchMock.mock.calls.filter(([u]) => String(u) === "/api/import/preview")
    expect(previews).toHaveLength(2)
    // The same file, not an empty body: a replayed upload that dropped its
    // attachment would import nothing and say it succeeded.
    expect((previews[1][1] as RequestInit).body).toBeInstanceOf(FormData)
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

    // The shape the server actually sends: the count is `created`, and the
    // report is nested. Stubbing a bare report here is what let the page read
    // a top-level `ok` that never existed and report every import as 0.
    fetchMock.mockReturnValue(
      ok({ created: 3, batch_id: "b1", report: { total: 3, ok: 3, rows: [] } }, 201),
    )
    await user.click(commit)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("已导入 3 台设备"))
  })

  it("sends the category and the file as one upload", async () => {
    fetchMock.mockReturnValue(ok({ total: 1, ok: 1, rows: [] }))
    const user = userEvent.setup()
    renderWithProviders(<Import />)
    await uploadAndPreview(user)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/import/preview", expect.any(Object)),
    )
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
          error: {
            code: "validation_failed",
            message: "有 1 行未通过校验，本次导入未写入任何数据",
          },
          report: {
            total: 2,
            ok: 1,
            rows: [{ line: 4, status: "error", fields: { mac: "已被占用" } }],
          },
        },
        422,
      ),
    )
    await user.click(screen.getByRole("button", { name: "确认导入" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("未写入任何数据")
    expect(screen.getByRole("row", { name: "第 4 行" })).toBeInTheDocument()
  })
})
