# Phase 1 Data Model: 持有方层级与保管责任

本文只描述**增量**。完整模型见 001，标识改动见 002，信息项与型号见 003，状态见 004。

---

## 1. `holder_entities` 的两处增量

```sql
ALTER TABLE holder_entities ADD COLUMN note TEXT NOT NULL DEFAULT '';
CREATE INDEX ix_holder_parent ON holder_entities(parent_id);
```

`parent_id` 列自 001 就存在，**从来没有被校验过，也没有被读过**。
本轮给它规则，不给它数据：存量的无上级部门保持原样（research.md D6）。

`note` 是自由文本，可空。它不是 `attrs` 的一部分 —— `attrs` 是给引用字段用的
键值袋，而备注是给人读的一行字，混在一起会让两者都难解释。

## 2. 层级规则

```text
company    → 无上级（有上级即拒绝）
department → 上级必填，且必须是 company
location   → 上级可空；若有，必须是 company 或 department
```

在 Go 里就是两张表：

```go
var allowedParents = map[model.EntityType][]model.EntityType{
	model.EntityCompany:    nil,
	model.EntityDepartment: {model.EntityCompany},
	model.EntityLocation:   {model.EntityCompany, model.EntityDepartment},
}
var parentRequired = map[model.EntityType]bool{model.EntityDepartment: true}
```

前端有同形的一份（`ALLOWED_PARENTS` / `PARENT_REQUIRED`），只用于**不提供**非法选项。

### 成环

类型规则不足以防环：`公司 → 部门 → 位置` 合法，把那个部门移到那个位置之下也「类型合法」，
但会闭合成环。`descendsFrom` 沿父链上行，命中即拒绝；同时带一个 `seen` 集合，
使得已经存在于数据里的环只会终止而不会死循环。

## 3. `statuses.in_stock.requires_location` 置 0

```sql
UPDATE statuses SET requires_location = 0 WHERE key = 'in_stock';
```

004 把这条从常量变成了列，本轮把它从**规则**降级为**策略**：

| 开关 | 谁在读 | 内置可改？ |
| --- | --- | --- |
| `requires_location` | 只有持有方校验本身 | **可以**（本轮改动） |
| `counts_as_available` | 概览的类别分布 | 不可以 |
| `terminal` | 转换矩阵 | 不可以 |

判据是「除了这条约束自己，还有谁依赖它」。只有第一个的答案是「没有」。

## 4. 拒绝的字段归属

```text
transfer.ErrHolderKind  →  422 validation_failed，fields: { to_holder_id: ... }
```

此前的路径是：`isTransitionError` 在错误文本里找「位置」→ 报 `illegal_transition`
→ 挂在 `to_status` 上。操作者动的是持有方，收到的是一句关于状态的话 ——
这正是「文案和实际行为不符合」。哨兵取代关键词，「位置」从关键词表里删除。

## 5. 流转请求的形状

**没有变化**。`to_owner_id` 自 001 就在 `transfer.Request` 里，
只是前端只在「改负责人」时填过它。本轮让签出、转移、归还在目标是实体时也填。

```json
{ "asset_ids": ["…"], "to_status": "in_use",
  "to_holder_type": "entity", "to_holder_id": "…",
  "to_owner_id": "…" }
```

省略 `to_owner_id` 表示「负责人不变」，与既有语义一致 ——
前端的「不变」选项就是不发这个字段，而不是发一个空串。

## 6. 资产筛选

`GET /assets` 的 `holder_type` + `holder_id` **自 001 就支持**，只是界面没有入口。
前端补一个下拉，并且**两个参数一起发**：只发 id 会让一个恰好相同的账号 id 也被匹配上。
