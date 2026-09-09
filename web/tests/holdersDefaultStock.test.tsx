import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Holders } from "@/routes/Holders"
import { renderWithProviders } from "@/test/renderWithProviders"
import { ApiError } from "@/lib/api"
import type { HolderEntity } from "@/lib/types"

/*
 * The default stock point: where a returned device goes when nobody says.
 *
 * These assertions came from metadata.test.tsx, where the marker was a tick
 * box inside the edit dialog. 028 moved it to a button in the pane, because
 * `holder.default_stock` is its **own permission** -- sharing an entrance with
 * `holder.update` meant somebody with the one and not the other could tick it,
 * press save, and only then be refused. Every old assertion is here; the ones
 * whose premise changed say so.
 */

const get = vi.fn()
const patch = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: vi.fn().mockResolvedValue({}),
      patch: (p: string, b: unknown) => patch(p, b),
      del: vi.fn(),
    },
  }
})

const company: HolderEntity = {
  id: "co", type: "company", name: "XX 集团",
  parent_id: null, note: "", is_default_stock: false,
}
const shanghai: HolderEntity = {
  id: "sh", type: "location", name: "上海仓库",
  parent_id: null, note: "", is_default_stock: false,
}
const beijing: HolderEntity = {
  id: "bj", type: "location", name: "北京仓库",
  parent_id: null, note: "", is_default_stock: true,
}

function serve(list: HolderEntity[]) {
  return (p: string) => {
    if (/^\/holders\/.+\/usage$/.test(p)) {
      return Promise.resolve({ assets: 0, children: 0, history: 0 })
    }
    if (p === "/holders/counts") return Promise.resolve({})
    if (p.startsWith("/holders")) return Promise.resolve(list)
    return Promise.resolve([])
  }
}

const AT = { path: ["/holders", "/holders/:id"] as string[] }

beforeEach(() => {
  get.mockReset().mockImplementation(serve([company, shanghai, beijing]))
  patch.mockReset().mockResolvedValue({})
})

describe("默认库存点", () => {
  // Was "marks a location as the default stock point", through the tick box.
  it("从右栏一按就设过去", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders/sh", ...AT })

    await user.click(await screen.findByRole("button", { name: "设为默认库存点" }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/holders/sh", { is_default_stock: true }),
    )
  })

  // Was "locks the box on the location that already holds the marker". The
  // marker moves but never switches off, so on the one that has it the control
  // has nothing to do -- and says why rather than looking broken.
  it("已经是默认库存点的，按钮禁用并说明只能移走", async () => {
    renderWithProviders(<Holders />, { route: "/holders/bj", ...AT })

    const button = await screen.findByRole("button", { name: "设为默认库存点" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("title", expect.stringContaining("不能取消"))
  })

  /*
   * Was "offers the default stock marker only on a location": on a company the
   * tick box was simply absent.
   *
   * Now it is disabled with the reason on it. Absent leaves "why can't I"
   * unanswered, and this button exists precisely because that answer used to
   * arrive only after the attempt. The create dialog already greys out 部门
   * with a reason rather than hiding it, so this is the page's own habit.
   */
  it("公司上禁用，并说出只有位置能当默认库存点", async () => {
    renderWithProviders(<Holders />, { route: "/holders/co", ...AT })

    const button = await screen.findByRole("button", { name: "设为默认库存点" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("title", expect.stringContaining("只有位置"))
  })

  /*
   * The reason the control moved at all.
   *
   * Somebody with holder.update but not holder.default_stock could tick the
   * box and press save, and the refusal arrived from the server. Now the
   * answer is on the button before it is pressed -- **and no request is made**,
   * which is what "before the attempt" means.
   */
  it("只有 holder.update 时按钮禁用，且不发请求", async () => {
    renderWithProviders(<Holders />, {
      route: "/holders/sh",
      ...AT,
      permissions: ["holder.update"],
    })

    const button = await screen.findByRole("button", { name: "设为默认库存点" })
    expect(button).toBeDisabled()
    expect(button.getAttribute("title")).toMatch(/设为默认库存点/)
    expect(patch).not.toHaveBeenCalled()

    // Editing is still offered: the two permissions are separate, and so are
    // the two controls now.
    expect(screen.getByRole("button", { name: "编辑" })).toBeEnabled()
  })

  // Was "sends no marker request when the box was not ticked" -- renaming used
  // to carry the marker along, and the server refuses is_default_stock:false.
  // With the marker out of the dialog entirely, a rename cannot touch it.
  it("改名不会捎带上默认库存点", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders/sh", ...AT })

    await user.click(await screen.findByRole("button", { name: "编辑" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByLabelText("设为默认库存点")).not.toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText("名称"))
    await user.type(within(dialog).getByLabelText("名称"), "上海一号仓")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).not.toHaveProperty("is_default_stock")
  })

  // Was "surfaces a refusal from the server rather than swallowing it".
  it("服务端拒绝时说出来，不吞掉", async () => {
    patch.mockRejectedValueOnce(
      new ApiError(409, "reference_blocked", "「北京仓库」是当前默认库存点，请先转移"),
    )
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders/sh", ...AT })

    await user.click(await screen.findByRole("button", { name: "设为默认库存点" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("是当前默认库存点")
  })

  /*
   * Was "lists the blocking devices when a holder cannot take the marker".
   *
   * The server has attached the blocking devices since the first version, and
   * an early client parsed only the count -- leaving the reader with a number
   * and nothing to act on.
   */
  it("拒绝时列出挡路的设备，并说明列表是截断的", async () => {
    patch.mockRejectedValueOnce(
      new ApiError(
        409,
        "reference_blocked",
        "「上海仓库」仍被 7 台设备使用，请先转移或改绑",
        undefined,
        undefined,
        [
          { asset_id: "a1", name: "112394521950", reason: "holder" },
          { asset_id: "a2", name: "112394521951", reason: "reference" },
        ],
        7,
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders/sh", ...AT })

    await user.click(await screen.findByRole("button", { name: "设为默认库存点" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("112394521950")
    expect(alert).toHaveTextContent("112394521951")
    // Two of seven were sent, so the page has to say the list is partial.
    expect(alert).toHaveTextContent("等共 7 台")
  })
})

describe("页头那一行", () => {
  /*
   * There is exactly one default stock point in the whole system, and since
   * 028 the rail pages -- so it can be on any page and the badge on its row
   * answers nothing to somebody looking for it. The answer is written out.
   */
  it("写出当前的默认库存点，并且可以点过去", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    const link = await screen.findByRole("link", { name: /默认库存点：北京仓库/ })
    await user.click(link)

    // Landing on it means its own pane is open, which is where the marker can
    // be moved from.
    expect(await screen.findByRole("heading", { name: "北京仓库" })).toBeInTheDocument()
  })

  // Without one, returning a device that names no destination fails. That is a
  // thing to say on the page rather than to discover at the counter.
  it("一个都没有时，说明归还会因此失败", async () => {
    get.mockImplementation(serve([company, shanghai]))
    renderWithProviders(<Holders />, { route: "/holders", ...AT })

    expect(await screen.findByText(/还没有默认库存点/)).toBeInTheDocument()
  })
})
