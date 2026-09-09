# 实施计划：字段页与型号页主从化

**规格**：[spec.md](./spec.md) ｜ **调研**：[research.md](./research.md)
**分支**：`025-master-detail-fields-models` ｜ **决策**：161–174

## Technical Context

| | |
|---|---|
| 新依赖 | **无** |
| 迁移 | **无**，不动表结构 |
| 新端点 | `GET /models/counts`、`GET /fields/binding-counts` |
| 新路由 | `/fields/:id`、`/models/:id`；`/fields/groups`、`/models/vendors` 改为重定向 |
| 骨架 | **预期零改动**（FR-029、SC-003） |

## Constitution Check

| 门禁 | 本轮 |
|---|---|
| 组件来自 shadcn/ui | ✅ 无新组件。左栏的简化分页条用 `Button`，不套 `Pager`（调研三） |
| DOM 测试 | ✅ 触及 UI，为主要手段 |
| 两种语言 | ✅ 新文案进两份目录 |
| 七条门禁 | ✅ **服务端有改动，四条要真跑** |
| 读默认全开放 | ✅ 两个新端点都不设权限 |
| 前端只负责禁用 | ✅ FR-024/025 |

### Complexity Tracking

**本轮唯一的复杂度是「同一个字段在树上出现多次」。** 它不是被引入的，是
`field_group_members` 的多对多本来就有的形状；被引入的是**让它可见**。
代价写在 FR-006/FR-007 两条互补的规则里：树上重复且全部高亮（重复携带信息），
搜索结果去重（平展后不再携带信息）。两条都由测试固定，因为它们互相矛盾时最像 bug。

## Phase 1：服务端

- `internal/asset`：`CountsByModel(ctx) map[string]int`，一条 `GROUP BY model_id, status`，
  用与 `subtreeCounts` 相同的状态过滤。
- `internal/schema`：`BindingCountsByField(ctx) map[string]int`，三张绑定表各一条
  `GROUP BY field_id`，内存相加。
- `GET /models/counts`、`GET /fields/binding-counts`，无权限守卫。
- 两份 `openapi.yaml` + `deploy/smoke.sh`。

## Phase 2：前端共用件

- `features/common/TreePager.tsx`：左栏用的简化分页条（上一页/下一页 + 第 n/N）。
  **不是 `Pager`** —— 300px 的栏放不下区间行与每页条数。
- `features/common/useFoldable.ts`：默认按子项数折起 + 手动覆盖，不进地址。

## Phase 3：字段页 / Phase 4：型号页 / Phase 5：路由与迁移 / Phase 6：文档与门禁

见 [tasks.md](./tasks.md)。

## 风险

| 风险 | 处置 |
|---|---|
| **绑定数少问一张表** | 三张表各一条测试，且有一条断言「绑在型号上的字段不显示 0」 |
| **翻页把选中项判成不存在** | 传给钩子的是全部 id 而非本页 id；有测试 |
| **重复与去重两条规则互相打架** | 同一个字段：树上 2 次、搜索 1 次，两个数都固定 |
| **骨架被顺手改掉** | SC-003 要求改动量为 0；FR-029 要求改了就报告 |
