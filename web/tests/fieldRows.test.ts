import { describe, expect, it } from "vitest"

import { fieldTreeRows, searchFieldRows } from "@/features/fields/fieldRows"
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/metaTypes"

const f = (id: string, key: string, label: string, binds: string[] = []) =>
  ({
    id, key, label, type: "text", options: {}, is_unique: false, required: false,
    category_ids: binds,
  }) as FieldDefinitionRow

const FIELDS = [
  f("f1", "mac", "基准 MAC", ["c1", "c2", "c3", "c4"]),
  f("f2", "fw", "固件版本", ["c1"]),
  f("f3", "rack", "机柜位"),
]
const GROUPS = [
  { id: "g1", name: "基本信息", field_ids: ["f1"] },
  { id: "g2", name: "IT 设备通用", field_ids: ["f1", "f2"] },
] as FieldGroupRow[]
const open = () => false

/**
 * Two rules that contradict each other on purpose, which is exactly why both
 * are pinned: in the tree a field repeats, in the search results it does not.
 */
describe("字段树的重复与去重", () => {
  it("属于两个组的字段，在树上出现两次", () => {
    const rows = fieldTreeRows({ groups: GROUPS, fields: FIELDS, isFolded: open })
    expect(rows.filter((r) => r.id === "f1" && r.kind === "field")).toHaveLength(2)
  })

  // Flattening removes the groups, and with them the only thing the repeat was
  // carrying. Two identical lines then say "this appears twice", which is not
  // true of the field -- there is one of it.
  it("同一个字段在搜索结果里只出现一次", () => {
    const rows = searchFieldRows({ groups: GROUPS, fields: FIELDS }, "MAC")
    expect(rows.filter((r) => r.id === "f1")).toHaveLength(1)
  })

  it("不属于任何组的字段落在一个不可选的标题下", () => {
    const rows = fieldTreeRows({ groups: GROUPS, fields: FIELDS, isFolded: open })
    const heading = rows.find((r) => r.kind === "ungrouped")
    expect(heading).toBeDefined()
    expect(heading!.id).toBe("")
    const after = rows.slice(rows.indexOf(heading!) + 1)
    expect(after.map((r) => r.id)).toEqual(["f3"])
  })

  it("一个组都没有时，不画空的分组层", () => {
    const rows = fieldTreeRows({ groups: [], fields: FIELDS, isFolded: open })
    expect(rows.filter((r) => r.kind === "group")).toHaveLength(0)
    expect(rows.filter((r) => r.kind === "field")).toHaveLength(3)
  })

  it("全部字段都分了组时，不画「未分组」标题", () => {
    const rows = fieldTreeRows({
      groups: [{ id: "g", name: "全部", field_ids: ["f1", "f2", "f3"] } as FieldGroupRow],
      fields: FIELDS,
      isFolded: open,
    })
    expect(rows.some((r) => r.kind === "ungrouped")).toBe(false)
  })

  it("折起的组不吐出成员，但自己还在，且写明有几个", () => {
    const rows = fieldTreeRows({
      groups: GROUPS,
      fields: FIELDS,
      isFolded: (id) => id === "g2",
    })
    const g2 = rows.find((r) => r.id === "g2")!
    expect(g2.count).toBe(2)
    expect(rows.filter((r) => r.id === "f2")).toHaveLength(0)
  })

  it("搜索也命中组名", () => {
    const rows = searchFieldRows({ groups: GROUPS, fields: FIELDS }, "基本")
    expect(rows.some((r) => r.kind === "group" && r.id === "g1")).toBe(true)
  })

  // Summed from the three id arrays the list endpoint already returns. Zero
  // is the value that matters: it is what somebody checks before deleting.
  it("绑定数为 0 的字段仍带着 0，而不是没有数", () => {
    const rows = fieldTreeRows({ groups: [], fields: FIELDS, isFolded: open })
    expect(rows.find((r) => r.id === "f1")!.count).toBe(4)
    expect(rows.find((r) => r.id === "f3")!.count).toBe(0)
  })
})
