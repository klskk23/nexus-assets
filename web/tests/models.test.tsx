import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Models } from "@/routes/Models"
import { listed } from "@/test/listing"
import { renderWithProviders } from "@/test/renderWithProviders"
import { tMeta } from "@/i18n"

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

const vendors = [
  { id: "v-dell", name: "Dell", model_count: 2 },
  { id: "v-lenovo", name: "Lenovo", model_count: 0 },
]

const categories = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "" },
]

const productModels = [
  {
    id: "m1",
    category_ids: ["net"],
    name: "Latitude 5420",
    vendor_id: "v-dell",
    vendor_name: "Dell",
    note: "已停产，改买 5430",
    attr_defaults: {},
  },
  {
    id: "m2",
    category_ids: ["net"],
    name: "无牌机",
    attr_defaults: {},
  },
]

function route(p: string) {
  if (p.startsWith("/vendors")) return Promise.resolve(listed(vendors, p))
  if (p.startsWith("/models/") && p.includes("vendor-change-impact")) {
    return Promise.resolve({ total: 4, fields: ["ServiceTag"] })
  }
  if (p === "/models/counts") return Promise.resolve({ m1: 12, m2: 0 })
  if (p.startsWith("/models")) return Promise.resolve(listed(productModels, p))
  if (p === "/categories") return Promise.resolve(categories)
  if (p.startsWith("/fields")) return Promise.resolve(listed([], p))
  return Promise.resolve([])
}

beforeEach(() => {
  get.mockReset().mockImplementation(route)
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

/** The page, open on one thing -- which is what the address names now. */
function openAt(id?: string, opts: Record<string, unknown> = {}) {
  return renderWithProviders(<Models />, {
    route: id ? `/models/${id}` : "/models",
    path: ["/models", "/models/:id"],
    ...opts,
  })
}

/**
 * Vendors and models on one page.
 *
 * They were two tabs over a real one-to-many: a model belongs to exactly one
 * vendor, and the relationship was the one thing neither table could show.
 */
describe("型号页的厂商与型号", () => {
  it("型号排在自己厂商下面，无厂商的在一个标题下", async () => {
    openAt()
    await screen.findByRole("link", { name: /Dell/ })
    const labels = screen.getAllByRole("link").map((l) => l.textContent ?? "")
    expect(labels.some((l) => l.includes("Dell"))).toBe(true)
    expect(labels.some((l) => l.includes("Latitude 5420"))).toBe(true)
    expect(screen.getByText("无厂商")).toBeInTheDocument()
  })

  it("厂商行写型号数，型号行写在册设备数", async () => {
    openAt()
    const dell = await screen.findByRole("link", { name: /Dell/ })
    expect(dell).toHaveTextContent("1")
    const latitude = screen.getByRole("link", { name: /Latitude 5420/ })
    expect(latitude).toHaveTextContent("12")
  })

  it("选中厂商时右栏是厂商详情，选中型号时是型号详情", async () => {
    const { unmount } = openAt("v-dell")
    expect(await screen.findByRole("heading", { name: "Dell" })).toBeInTheDocument()
    unmount()

    openAt("m1")
    expect(await screen.findByRole("heading", { name: "Latitude 5420" })).toBeInTheDocument()
  })

  /**
   * The note is why the pane is worth opening.
   *
   * "已停产，改买 5430" is the one thing you need before choosing this model,
   * and it was on the old table. 025 rewrote this page and dropped it -- along
   * with the test that would have said so, because the test was rewritten in
   * the same pass. A feature and its guard can only be deleted together by the
   * same hand.
   */
  it("型号详情显示备注", async () => {
    openAt("m1")
    expect(await screen.findByText(/已停产，改买 5430/)).toBeInTheDocument()
  })

  it("没有备注时不画一个空的备注区", async () => {
    openAt("m2")
    await screen.findByRole("heading", { name: "无牌机" })
    expect(screen.queryByText(tMeta.models.note)).not.toBeInTheDocument()
  })

  it("新建厂商", async () => {
    const user = userEvent.setup()
    openAt()
    await screen.findByRole("link", { name: /Dell/ })

    await user.click(screen.getByRole("button", { name: /新建厂商/ }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("厂商名"), "华三")
    await user.click(within(dialog).getByRole("button", { name: "新建厂商" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/vendors", { name: "华三" }))
  })

  it("改厂商名走现有的编辑对话框", async () => {
    const user = userEvent.setup()
    openAt("v-dell")
    await user.click(await screen.findByRole("button", { name: "编辑" }))
    const dialog = await screen.findByRole("dialog")
    await user.clear(within(dialog).getByLabelText("厂商名"))
    await user.type(within(dialog).getByLabelText("厂商名"), "Dell EMC")
    await user.click(within(dialog).getByRole("button", { name: "保存" }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/vendors/v-dell", { name: "Dell EMC" }))
  })

  /**
   * 023 split these two apart so that whoever manages models can fix a
   * vendor's name without also being able to reshape what every device
   * records. Merging them back into one switch here would undo that quietly.
   */
  it("只有 model.manage 时能改厂商名，字段绑定那半说明缺什么", async () => {
    openAt("v-dell", { permissions: ["model.manage"] })
    expect(await screen.findByRole("button", { name: "编辑" })).toBeEnabled()
    expect(screen.getByText(/管理类别与字段/)).toBeInTheDocument()
  })

  it("只有 schema.manage 时，改名被禁用并说明缺「管理型号」", async () => {
    openAt("v-dell", { permissions: ["schema.manage"] })
    const edit = await screen.findByRole("button", { name: "编辑" })
    expect(edit).toBeDisabled()
    expect(edit).toHaveAttribute("title", expect.stringContaining("管理型号"))
  })

  it("两个权限都没有时，内容仍然全部可见", async () => {
    openAt("v-dell", { permissions: [] })
    expect(await screen.findByRole("heading", { name: "Dell" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Latitude 5420/ })).toBeInTheDocument()
  })

  it("右栏没有破坏性动作", async () => {
    openAt("m1")
    await screen.findByRole("heading", { name: "Latitude 5420" })
    expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument()
  })

  /*
   * Creating a model that names its vendor.
   *
   * The create form and the edit form are one component, and "the vendor
   * changed" was read off the draft alone -- true on creation the moment
   * anybody picked one. So Save ran the dry-run that says what changing a
   * vendor costs, for a model with no id: GET /models//vendor-change-impact,
   * 404, and a confirmation that never arrived. Save did nothing at all, with
   * nothing on screen to say why, and a new model could only be saved by
   * leaving the vendor empty.
   *
   * The assertion is on the request rather than on the outcome, because the
   * mock below answers anything under /models/ -- including the path with the
   * hole in it. A test that only watched the dialog close would have passed
   * against a server that 404s, which is the whole shape of the 026 lesson.
   */
  it("新建型号时不问「换厂商的代价」，直接存", async () => {
    const user = userEvent.setup()
    openAt()

    await user.click(await screen.findByRole("button", { name: /新建型号/ }))
    await user.type(await screen.findByLabelText(tMeta.models.name), "E54C")
    await user.click(screen.getByRole("combobox", { name: tMeta.models.vendor }))
    await user.click(await screen.findByRole("option", { name: "Dell" }))
    await user.click(screen.getByRole("button", { name: tMeta.models.save }))

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][0]).toBe("/models")
    expect(post.mock.calls[0][1]).toMatchObject({ name: "E54C", vendor_id: "v-dell" })
    expect(get.mock.calls.flat().filter((p) => String(p).includes("vendor-change-impact"))).toEqual(
      [],
    )
  })

  // The other half: on a model that exists, the warning is still owed.
  it("改已有型号的厂商，仍然先问代价", async () => {
    const user = userEvent.setup()
    openAt("m1")

    await user.click(await screen.findByRole("button", { name: tMeta.models.edit }))
    await user.click(await screen.findByRole("combobox", { name: tMeta.models.vendor }))
    await user.click(await screen.findByRole("option", { name: "Lenovo" }))
    await user.click(screen.getByRole("button", { name: tMeta.models.save }))

    await waitFor(() =>
      expect(
        get.mock.calls.flat().filter((p) => String(p).includes("vendor-change-impact")),
      ).not.toEqual([]),
    )
    expect(patch).not.toHaveBeenCalled()
  })
})

/*
 * A field can reach one model by two routes at once: bound to the model, and
 * bound to that model's vendor.
 *
 * Reported from real use -- the pane listed it twice, once under each heading,
 * with the same React key on both rows, which is how two rows for one field
 * went unnoticed. It is one field: the entry form asks for it once and the
 * server's schema returns it once.
 *
 * Keeping one and dropping the other would not do, because the label is
 * load-bearing. "厂商" alone tells somebody that unbinding the vendor takes the
 * field off this model, and it does not -- the direct binding keeps it. So the
 * row names every route it took.
 */
describe("同一个字段既绑型号又绑厂商", () => {
  const dual = [
    {
      id: "f-dual", key: "service_tag", label: "Service Tag", type: "text",
      options: {}, is_unique: false, category_ids: [],
      model_ids: ["m1"], vendor_ids: ["v-dell"],
    },
    {
      id: "f-vendor", key: "warranty", label: "保修期", type: "text",
      options: {}, is_unique: false, category_ids: [], model_ids: [], vendor_ids: ["v-dell"],
    },
  ]

  beforeEach(() => {
    get.mockImplementation((p: string) =>
      p.startsWith("/fields") ? Promise.resolve(listed(dual, p)) : route(p),
    )
  })

  it("只列一行，不是两行", async () => {
    renderWithProviders(<Models />, { route: "/models/m1", path: "/models/:id" })

    const table = await screen.findByRole("table")
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows.filter((r) => r.textContent?.includes("service_tag"))).toHaveLength(1)
    // The other field is untouched: one route, one row.
    expect(rows).toHaveLength(2)
  })

  it("那一行把两条来路都写出来", async () => {
    renderWithProviders(<Models />, { route: "/models/m1", path: "/models/:id" })

    const row = await screen.findByRole("row", { name: "Service Tag" })
    expect(within(row).getByText("厂商")).toBeInTheDocument()
    expect(within(row).getByText("本型号")).toBeInTheDocument()
  })

  it("只有一条来路的字段仍然只写那一条", async () => {
    renderWithProviders(<Models />, { route: "/models/m1", path: "/models/:id" })

    const row = await screen.findByRole("row", { name: "保修期" })
    expect(within(row).getByText("厂商")).toBeInTheDocument()
    expect(within(row).queryByText("本型号")).not.toBeInTheDocument()
  })
})
