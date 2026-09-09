import { describe, expect, it } from "vitest"

import { modelTreeRows, searchModelRows } from "@/features/models/modelRows"
import { clampPage, pageCount, pageOfRoots } from "@/features/common/rootPaging"
import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"

const VENDORS = [
  { id: "v1", name: "MikroTik" },
  { id: "v2", name: "Dell EMC" },
] as VendorRow[]
const MODELS = [
  { id: "m1", name: "X100", vendor_id: "v1" },
  { id: "m2", name: "X200", vendor_id: "v1" },
  { id: "m3", name: "R640", vendor_id: "v2" },
  { id: "m4", name: "自建 NAS" },
] as ProductModelRow[]
const COUNTS = { m1: 42, m2: 0, m3: 7, m4: 3 }
const open = () => false

describe("型号树", () => {
  it("型号排在自己厂商下面", () => {
    const rows = modelTreeRows({ vendors: VENDORS, models: MODELS, counts: COUNTS, isFolded: open })
    const ids = rows.map((r) => r.id)
    expect(ids.indexOf("m1")).toBeGreaterThan(ids.indexOf("v1"))
    expect(ids.indexOf("m3")).toBeGreaterThan(ids.indexOf("v2"))
  })

  // Unlike the fields rail, nothing repeats: a model has one vendor or none.
  it("没有任何型号出现两次", () => {
    const rows = modelTreeRows({ vendors: VENDORS, models: MODELS, counts: COUNTS, isFolded: open })
    const models = rows.filter((r) => r.kind === "model").map((r) => r.id)
    expect(new Set(models).size).toBe(models.length)
  })

  it("无厂商的型号落在一个不可选的标题下", () => {
    const rows = modelTreeRows({ vendors: VENDORS, models: MODELS, counts: COUNTS, isFolded: open })
    const heading = rows.find((r) => r.kind === "novendor")!
    expect(heading.id).toBe("")
    expect(rows[rows.indexOf(heading) + 1].id).toBe("m4")
  })

  it("厂商行写型号数，型号行写设备数，0 也写", () => {
    const rows = modelTreeRows({ vendors: VENDORS, models: MODELS, counts: COUNTS, isFolded: open })
    expect(rows.find((r) => r.id === "v1")!.count).toBe(2)
    expect(rows.find((r) => r.id === "m2")!.count).toBe(0)
  })

  it("折起的厂商不吐出型号", () => {
    const rows = modelTreeRows({
      vendors: VENDORS, models: MODELS, counts: COUNTS,
      isFolded: (id) => id === "v1",
    })
    expect(rows.some((r) => r.id === "m1")).toBe(false)
    expect(rows.find((r) => r.id === "v1")!.count).toBe(2)
  })

  it("搜索平展，厂商与型号都能命中", () => {
    expect(searchModelRows({ vendors: VENDORS, models: MODELS, counts: COUNTS }, "x1").map((r) => r.id))
      .toEqual(["m1"])
    expect(searchModelRows({ vendors: VENDORS, models: MODELS, counts: COUNTS }, "dell").map((r) => r.id))
      .toEqual(["v2"])
  })
})

/**
 * The one rule that makes paging a tree safe.
 *
 * Page the flattened rows instead and page two opens with a model whose vendor
 * was the last row of page one -- an indented line under nothing, claiming a
 * position that is not on screen. 014 decision 91.
 */
describe("按根节点分页", () => {
  it("一页是 N 个根及其全部后代，行数因此不固定", () => {
    const roots = pageOfRoots(VENDORS, 0, 1)
    const rows = modelTreeRows({ vendors: roots, models: MODELS, counts: COUNTS, isFolded: open })
    // One vendor, both of its models, and the vendorless heading with its own.
    expect(rows.filter((r) => r.kind === "model").map((r) => r.id)).toEqual(["m1", "m2", "m4"])
    // Every model row has its vendor on the same page.
    for (const r of rows.filter((r) => r.kind === "model" && r.depth === 1)) {
      const owner = MODELS.find((m) => m.id === r.id)!.vendor_id
      if (owner) expect(rows.some((x) => x.id === owner)).toBe(true)
    }
  })

  it("页数按根数算，不按行数", () => {
    expect(pageCount(2, 1)).toBe(2)
    expect(pageCount(0, 20)).toBe(1)
  })

  // A page number can outlive the list it indexed into -- delete the last
  // vendor while sitting on the last page and there is no page there.
  it("列表缩短后，页码被夹回存在的范围", () => {
    expect(clampPage(5, 2, 1)).toBe(1)
    expect(clampPage(-3, 10, 5)).toBe(0)
  })
})
