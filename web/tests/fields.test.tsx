import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Fields } from "@/routes/Fields"
import { listed } from "@/test/listing"
import { renderWithProviders } from "@/test/renderWithProviders"

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: (p: string) => del(p),
    },
  }
})

const fields = [
  {
    id: "f1", key: "mac", label: "基准 MAC", type: "mac", options: {}, is_unique: true,
    category_ids: ["net"], model_ids: [], vendor_ids: [],
  },
  { id: "f2", key: "firmware", label: "固件版本", type: "text", options: {}, is_unique: false },
  { id: "f3", key: "tunnels", label: "隧道数", type: "number", options: {}, is_unique: false },
]

// f1 is in both groups on purpose: many-to-many is the shape of
// field_group_members, and it is what the tree has to survive.
const groups = [
  { id: "g-net", name: "网络参数", field_ids: ["f1", "f2"] },
  { id: "g-common", name: "通用", field_ids: ["f1"] },
]

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]
const productModels = [
  { id: "m1", category_ids: ["net"], name: "Latitude 5420", vendor_id: "v-lenovo", vendor_name: "Dell", attr_defaults: {} },
]
const vendors = [{ id: "v-dell", name: "Dell", model_count: 1 }]

function route(p: string) {
  if (p.startsWith("/field-groups")) return Promise.resolve(listed(groups, p))
  if (p === "/categories") return Promise.resolve(categories)
  if (p === "/models") return Promise.resolve(productModels)
  if (p === "/vendors") return Promise.resolve(vendors)
  if (p.startsWith("/fields")) {
    return Promise.resolve({ items: fields, total: fields.length, offset: 0, limit: 500 })
  }
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

function openAt(id?: string, opts: Record<string, unknown> = {}) {
  return renderWithProviders(<Fields />, {
    route: id ? `/fields/${id}` : "/fields",
    path: ["/fields", "/fields/:id"],
    ...opts,
  })
}

/**
 * Fields and their groups on one page.
 *
 * A field belongs to any number of groups, so it appears under each of them.
 * The repetition is allowed to show because selection carries the information
 * back -- the address names the field, not the row, so every copy lights up and
 * the reader sees that it sits in two groups.
 */
describe("字段页的树", () => {
  it("组是父节点，未分组的在一个标题下", async () => {
    openAt()
    await screen.findByRole("link", { name: /网络参数/ })
    expect(screen.getByText("未分组")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /隧道数/ })).toBeInTheDocument()
  })

  it("属于两个组的字段在树上出现两次，且同时高亮", async () => {
    openAt("f1")
    const copies = await screen.findAllByRole("link", { name: /基准 MAC/ })
    expect(copies).toHaveLength(2)
    for (const c of copies) expect(c).toHaveAttribute("aria-current", "true")
  })

  // Flattening removes the groups, and with them the only thing the repeat was
  // carrying.
  it("搜索之后只出现一次", async () => {
    const user = userEvent.setup()
    openAt()
    await screen.findByRole("link", { name: /网络参数/ })
    await user.type(screen.getByLabelText(/名称|键/), "MAC")
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /基准 MAC/ })).toHaveLength(1),
    )
  })

  it("字段行带绑定数，0 也写出来", async () => {
    openAt()
    const mac = (await screen.findAllByRole("link", { name: /基准 MAC/ }))[0]
    expect(mac).toHaveTextContent("1")
    expect(screen.getByRole("link", { name: /隧道数/ })).toHaveTextContent("0")
  })

  it("选中字段是字段详情，选中组是组详情", async () => {
    const { unmount } = openAt("f1")
    expect(await screen.findByRole("heading", { name: "基准 MAC" })).toBeInTheDocument()
    // Where it is bound, which used to need the edit dialog.
    expect(screen.getByText("网络设备")).toBeInTheDocument()
    unmount()

    openAt("g-net")
    expect(await screen.findByRole("heading", { name: "网络参数" })).toBeInTheDocument()
    expect(screen.getByRole("row", { name: /固件版本/ })).toBeInTheDocument()
  })

  it("新建字段与新建组是两个按钮", async () => {
    const user = userEvent.setup()
    openAt()
    await screen.findByRole("link", { name: /网络参数/ })

    await user.click(screen.getByRole("button", { name: /新建字段组/ }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("组名"), "采购")
    await user.click(within(dialog).getByRole("button", { name: "新建字段组" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/field-groups",
        expect.objectContaining({ name: "采购", field_ids: [] }),
      ),
    )
  })

  it("没有 schema.manage 时两个新建都禁用并说明", async () => {
    openAt(undefined, { permissions: [] })
    await screen.findByRole("link", { name: /网络参数/ })
    for (const name of [/新建字段$/, /新建字段组/]) {
      const b = screen.getByRole("button", { name })
      expect(b).toBeDisabled()
      expect(b).toHaveAttribute("title", expect.stringContaining("管理类别与字段"))
    }
  })

  it("右栏没有破坏性动作", async () => {
    openAt("f1")
    await screen.findByRole("heading", { name: "基准 MAC" })
    expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument()
  })
})
