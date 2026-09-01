import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Assets } from "@/routes/Assets"
import { renderWithProviders } from "@/test/renderWithProviders"
import { statusRoute } from "./fixtures/statuses"
import { chooseByLabel } from "@/test/choose"
import { stubDownloads, type Downloads } from "@/test/downloads"

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router")
  return { ...actual, useNavigate: () => vi.fn() }
})

const get = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return { ...actual, api: { get: (p: string) => get(p), post: vi.fn(), patch: vi.fn(), del: vi.fn() } }
})

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]
const users = [
  { id: "u1", email: "a@example.com", name: "管理员", auth_type: "local", status: "active" },
]
const holders = [
  {
    id: "loc", type: "location", name: "上海仓库",
    parent_id: null, note: "", is_default_stock: true,
  },
]
const page = { items: [], total: 0, offset: 0, limit: 50 }
const schema = {
  category: categories[0],
  fields: [
    { id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true, required: true, sort: 10 },
    { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false, required: false, sort: 20 },
  ],
}

let dl: Downloads

beforeEach(() => {
  get.mockReset().mockImplementation((p: string) => {
    const st = statusRoute(p)
    if (st) return st
    if (p === "/categories") return Promise.resolve(categories)
    if (p === "/users") return Promise.resolve(users)
    if (p === "/holders") return Promise.resolve(holders)
    if (p.endsWith("/schema")) return Promise.resolve(schema)
    return Promise.resolve(page)
  })
  localStorage.clear()
  dl = stubDownloads()
})

afterEach(() => dl.restore())

/** Opens the dialog and returns it. */
async function openExport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "导出 CSV" }))
  return screen.findByRole("dialog")
}

/** The query the export was actually asked for. */
function exported(): URLSearchParams {
  const url = dl.urls.find((u) => u.includes("/export.csv"))
  if (url === undefined) throw new Error(`no export was requested; asked for ${dl.urls.join(", ")}`)
  return new URLSearchParams(url.split("?")[1])
}

describe("export from the asset list", () => {
  // The bug this replaces: a plain <a download> is a navigation, it carries no
  // Authorization header, and the browser reported a download that failed with
  // nothing on screen to read.
  it("fetches the file with the session's credential and hands it to the browser", async () => {
    localStorage.setItem("nexus.token", "tok")
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const dialog = await openExport(user)

    await chooseByLabel(user, "资产类别", "网络设备")
    await user.click(within(dialog).getByRole("button", { name: "导出" }))

    await waitFor(() => expect(exported().get("category_id")).toBe("net"))
    const [, init] = dl.fetchMock.mock.calls.at(-1) as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok")
    expect(dl.saved).toHaveLength(1)
  })

  it("takes the filename the server asked for", async () => {
    dl.fetchMock.mockResolvedValue(dl.csv("a\n1\n", "资产清单.csv"))
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const dialog = await openExport(user)

    await chooseByLabel(user, "资产类别", "网络设备")
    await user.click(within(dialog).getByRole("button", { name: "导出" }))

    await waitFor(() => expect(dl.saved).toHaveLength(1))
    expect(dl.saved[0].name).toBe("资产清单.csv")
  })

  // A category decides the columns, so an export without one is a spreadsheet
  // with nothing in it that tells two devices apart.
  it("will not export until a category is chosen", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const dialog = await openExport(user)

    expect(within(dialog).getByRole("button", { name: "导出" })).toBeDisabled()
    await chooseByLabel(user, "资产类别", "网络设备")
    expect(within(dialog).getByRole("button", { name: "导出" })).toBeEnabled()
  })

  it("starts from the category the list is filtered by", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByRole("button", { name: "导出 CSV" })
    await chooseByLabel(user, "类别", "网络设备")

    const dialog = await openExport(user)
    expect(within(dialog).getByLabelText("资产类别")).toHaveTextContent("网络设备")
  })

  describe("choosing the columns", () => {
    it("exports every field unless told otherwise", async () => {
      const user = userEvent.setup()
      renderWithProviders(<Assets />)
      const dialog = await openExport(user)
      await chooseByLabel(user, "资产类别", "网络设备")

      await user.click(within(dialog).getByRole("button", { name: "导出" }))
      await waitFor(() => expect(exported().get("fields")).toBe("mac,firmware"))
    })

    it("sends only what is ticked", async () => {
      const user = userEvent.setup()
      renderWithProviders(<Assets />)
      const dialog = await openExport(user)
      await chooseByLabel(user, "资产类别", "网络设备")

      await user.click(await within(dialog).findByRole("checkbox", { name: "基准 MAC" }))
      await user.click(within(dialog).getByRole("button", { name: "导出" }))
      await waitFor(() => expect(exported().get("fields")).toBe("firmware"))
    })

    // Empty is a request, not a missing answer: it asks for the fixed columns
    // alone, and leaving the parameter out would mean all of them.
    it("can ask for none of them", async () => {
      const user = userEvent.setup()
      renderWithProviders(<Assets />)
      const dialog = await openExport(user)
      await chooseByLabel(user, "资产类别", "网络设备")

      await user.click(await within(dialog).findByRole("button", { name: "全不选" }))
      await user.click(within(dialog).getByRole("button", { name: "导出" }))
      await waitFor(() => expect(exported().get("fields")).toBe(""))
    })
  })

  // An export that quietly ignored the filters would be worse than none.
  it("carries the active filters", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByRole("button", { name: "导出 CSV" })

    await user.type(screen.getByLabelText(/搜索资产/), "4D5E")
    await chooseByLabel(user, "状态", "已签出")

    const dialog = await openExport(user)
    await chooseByLabel(user, "资产类别", "网络设备")
    await user.click(within(dialog).getByRole("button", { name: "导出" }))

    await waitFor(() => expect(exported().get("q")).toBe("4D5E"))
    expect(exported().get("status")).toBe("in_use")
    expect(exported().get("include_descendants")).toBe("true")
  })

  it("follows the descendants switch", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    await screen.findByRole("button", { name: "导出 CSV" })

    await chooseByLabel(user, "类别", "网络设备")
    await user.click(screen.getByLabelText("含子类别"))

    const dialog = await openExport(user)
    await user.click(within(dialog).getByRole("button", { name: "导出" }))
    await waitFor(() => expect(exported().get("include_descendants")).toBe("false"))
  })

  // The page behind the dialog is hidden from a reader and covered for
  // everyone else, so a refusal shown there is a refusal nobody sees.
  it("shows a refusal inside the dialog", async () => {
    dl.fetchMock.mockResolvedValue(dl.refusal(422, "请选择要导出的资产类别"))
    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const dialog = await openExport(user)

    await chooseByLabel(user, "资产类别", "网络设备")
    await user.click(within(dialog).getByRole("button", { name: "导出" }))

    expect(await within(dialog).findByText("请选择要导出的资产类别")).toBeInTheDocument()
  })

  // An export is exactly what somebody clicks after leaving a tab open all
  // morning, so the expired access token has to renew itself on the way.
  it("renews an expired session and retries once", async () => {
    localStorage.setItem("nexus.token", "stale")
    dl.fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      dl.urls.push(String(url))
      if (String(url).includes("/auth/refresh")) {
        localStorage.setItem("nexus.token", "fresh")
        return Promise.resolve(
          new Response(JSON.stringify({ token: "fresh" }), {
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      return Promise.resolve(auth === "Bearer fresh" ? dl.csv() : dl.refusal(401, "会话已过期"))
    })

    const user = userEvent.setup()
    renderWithProviders(<Assets />)
    const dialog = await openExport(user)
    await chooseByLabel(user, "资产类别", "网络设备")
    await user.click(within(dialog).getByRole("button", { name: "导出" }))

    await waitFor(() => expect(dl.saved).toHaveLength(1))
    expect(dl.urls.filter((u) => u.includes("/export.csv"))).toHaveLength(2)
  })
})
