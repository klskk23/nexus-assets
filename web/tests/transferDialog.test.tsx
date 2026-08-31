import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TransferDialog } from "@/features/transfers/TransferDialog"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseByLabel } from "@/test/choose"
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

const me = { id: "u1", email: "a@example.com", name: "管理员", auth_type: "local", status: "active" }
const users = [me, { id: "u2", email: "z@example.com", name: "张三", auth_type: "local", status: "active" }]
const holders = [
  { id: "co", type: "company", name: "XX 集团", parent_id: null, note: "", is_default_stock: false },
  { id: "loc", type: "location", name: "上海仓库", parent_id: null, note: "", is_default_stock: true },
]

beforeEach(() => {
  // A signed-in session, so the responsible-party picker has a default to land
  // on rather than falling back to "leave it alone".
  localStorage.setItem("nexus.token", "t")
  get.mockReset().mockImplementation((p: string) => {
    const st = statusRoute(p)
    if (st) return st
    if (p === "/me") return Promise.resolve(me)
    if (p === "/users") return Promise.resolve(users)
    return Promise.resolve(holders)
  })
  post.mockReset().mockResolvedValue({ batch_id: null, transfers: [{ id: "t1" }] })
})

/** The action selector is a ToggleGroup, so its items are radios. */
async function pick(user: ReturnType<typeof userEvent.setup>, action: string) {
  await user.click(await screen.findByRole("radio", { name: action }))
}

function open() {
  return renderWithProviders(
    <TransferDialog assetIDs={["a1"]} open onOpenChange={vi.fn()} onDone={vi.fn()} />,
  )
}

describe("TransferDialog responsible party", () => {
  // Handing a device to a person answers "who is answerable" by itself.
  it("asks for no owner when the target is an account", async () => {
    const user = userEvent.setup()
    open()

    await pick(user, "签出")
    await chooseByLabel(user, "账号", "张三")

    expect(screen.queryByLabelText("负责人")).not.toBeInTheDocument()
  })

  // Handing it to a company does not: somebody still has to be the one you ask.
  it("asks for one when the target is a company, defaulting to the current account", async () => {
    const user = userEvent.setup()
    open()

    await pick(user, "签出")
    await chooseByLabel(user, "目标", "公司 / 位置 / 部门")
    await chooseByLabel(user, "持有方", "XX 集团")

    const owner = await screen.findByRole("combobox", { name: "负责人" })
    await waitFor(() => expect(owner).toHaveTextContent("管理员"))

    await user.click(screen.getByRole("button", { name: "提交" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "",
        to_status: "in_use",
        to_holder_type: "entity",
        to_holder_id: "co",
        to_owner_id: "u1",
      }),
    )
  })

  it("carries the owner through a plain transfer", async () => {
    const user = userEvent.setup()
    open()

    await pick(user, "转移")
    await chooseByLabel(user, "目标", "公司 / 位置 / 部门")
    await chooseByLabel(user, "持有方", "上海仓库")
    await chooseByLabel(user, "负责人", "张三")
    await user.click(screen.getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "",
        to_holder_type: "entity",
        to_holder_id: "loc",
        to_owner_id: "u2",
      }),
    )
  })

  // Check-in always lands on an entity -- the default stock point -- so it asks
  // too, without a holder picker of its own.
  it("asks on check-in, and lets the answer be 'leave it alone'", async () => {
    const user = userEvent.setup()
    open()

    await pick(user, "归还")
    await chooseByLabel(user, "负责人", "不变")
    await user.click(screen.getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "",
        to_status: "in_stock",
        check_in: true,
      }),
    )
  })
})

describe("TransferDialog check-in destination", () => {
  // The default is the only answer that can differ across a batch: twenty
  // devices from four warehouses go back to four warehouses.
  it("names no destination unless one is chosen", async () => {
    const user = userEvent.setup()
    open()

    await pick(user, "归还")
    expect(screen.getByRole("combobox", { name: "目标" })).toHaveTextContent("各自的默认归属")
    await user.click(screen.getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "",
        to_status: "in_stock",
        check_in: true,
      }),
    )
  })

  it("sends the destination when one is picked", async () => {
    const user = userEvent.setup()
    open()

    await pick(user, "归还")
    await chooseByLabel(user, "目标", "上海仓库")
    await user.click(screen.getByRole("button", { name: "提交" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/transfers", {
        asset_ids: ["a1"],
        note: "",
        to_status: "in_stock",
        check_in: true,
        to_holder_type: "entity",
        to_holder_id: "loc",
      }),
    )
  })
})
