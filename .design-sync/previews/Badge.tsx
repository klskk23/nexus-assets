import { Badge } from "nexus-assets-web"

/**
 * A pill-shaped label for a fact about a record. Not a status chip -- a
 * device's status has its own component, `StatusBadge`, which resolves the
 * status key to the catalogue's label and colour. Reach for that one whenever
 * the thing being labelled is 在库 / 已签出 / 维修中 / 丢失 / 已报废.
 *
 * The outline variant is what the field pages use to say which side a field is
 * bound to. It is quiet on purpose: the binding is context for the row, not
 * the row's subject.
 */
export const WhatAFieldIsBoundTo = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="outline">类别 · 网络设备</Badge>
    <Badge variant="outline">型号 · Catalyst 9200</Badge>
    <Badge variant="outline">厂商 · 思科</Badge>
    <Badge variant="outline">未绑定</Badge>
  </div>
)

/**
 * The default badge is the terracotta primary, and it is spent on what kind of
 * record something is -- the one word that decides how the rest of the row
 * should be read. Two of these next to each other in a table already competes
 * with the data; three is a decoration.
 */
export const WhatKindOfRecord = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>类别</Badge>
    <Badge>字段</Badge>
    <Badge>型号</Badge>
    <Badge>持有方</Badge>
    <Badge>字段组</Badge>
  </div>
)

/**
 * The rest of the variants, each with the one job it has here: `secondary` for
 * a derived or inherited fact, `destructive` for a count that is a problem,
 * `ghost` for a marker that must not draw the eye at all.
 */
export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">继承</Badge>
    <Badge variant="secondary">唯一</Badge>
    <Badge variant="outline">必填</Badge>
    <Badge variant="destructive">3 条冲突</Badge>
    <Badge variant="ghost">默认库存点</Badge>
  </div>
)

/**
 * In the audit toolbar a badge states the filter currently narrowing the list.
 * The identifier keeps `font-mono tabular-nums` so a serial can be compared
 * against the one on the label in someone's hand.
 */
export const AsAFilterStatement = () => (
  <div className="flex flex-wrap items-center gap-2 text-sm">
    <Badge variant="outline">
      <span className="font-mono tabular-nums">仅 2199023255611</span>
    </Badge>
    <Badge variant="outline">上海仓库</Badge>
    <Badge variant="outline">2026-08-03 – 2026-08-14</Badge>
  </div>
)
