# Implementation Plan: 持有方主从化，四个主从页拉齐

**Branch**: `028-master-detail-holders` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-master-detail-holders/spec.md`

## Summary

持有方页从 `CrudPage` 表格改为左树右详情，成为主从骨架的**第四个**调用方；
新增一条批量的子树设备计数，并给资产列表的持有方筛选加上「含下级」，
使「行尾的数 = 链接文案里的数 = 点进去的行数」三者相等。

**调研推翻了本轮任务的一半**：类别页的分页与折叠**已经在了**（025 抽共用件时一并接上），
只是演示库只有 4 个类别、3 个根、最大子项数 1，两个控件的阈值都是 12，所以永远不显形。
组件注释与 `docs/rules/web-tables.md` 至今仍写着「不折叠」。
因此那一半的动作是**补一条分页测试 + 校正两处说反话的记录**，不是实现功能。

服务端「子树」将有两处 SQL（计数一处、筛选一处），用一条**互相比对**的测试钉住，
而不是靠注释互相指认。

## Technical Context

**Language/Version**: Go 1.26；TypeScript 5 / React 19

**Primary Dependencies**: Gin、modernc.org/sqlite（`CGO_ENABLED=0`）、goose；
Vite 6、react-router 7、TanStack Query 5、Tailwind v4、shadcn/ui

**Storage**: SQLite。**本轮无迁移** —— 子树靠 `holder_entities.parent_id` 上的递归 CTE，
不给持有方加物化路径列（见 research 第二节）

**Testing**: `go test ./...`；Vitest 3 + React Testing Library（`--maxWorkers=4`）

**Target Platform**: 单一静态二进制，前端 embed

**Project Type**: Web（Go 后端 + React 前端，同一仓库）

**Performance Goals**: 打开持有方页时用于计数的请求数**与持有方数量无关**
（现状是每个持有方一次 `usage`，N+1）

**Constraints**: 七条合并门禁；核心管线覆盖率 ≥80%；组件必须来自 shadcn/ui；
文案两种语言；**推送与发布等确认**

**Scale/Scope**: 持有方几十到几百、最深三层；前端 4 个新文件 + 1 页重写，
后端 2 个新查询 + 1 条新路由

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v1.2.1。

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层不变**：计数与筛选都落在 `internal/asset`（它已经是「按某个维度数设备」的归属地，`subtreeCounts` 就在那儿），**不给 `asset.Service` 增加 holder 依赖** —— 递归 CTE 直接读 `holder_entities`，与它读 `categories.path` 是同一种做法。HTTP 层只做组装。**零新增依赖**，前端全部复用 025 抽出的形状件（`Rail`/`RailRow`/`TreePager`/`rootPaging`/`useFoldable`/`MasterDetail`/`useMasterSelection`）。`Holders.tsx` 现在 494 行且混着表格、两个对话框、两路拒绝态，拆成 `HolderTree` / `HolderDetail` / `HolderEditor` / `holderRows` 四件。 |
| II | 测试标准 | **服务端**：`TestHolderSubtreeCounts`（三层树含空节点与报废设备）、`TestHolderCountsAgreeWithTheFilteredList`（**对每一个持有方**断言计数 == 筛选结果行数 —— SC-002 在服务端的落点）、`TestAssetsFilterByHolderIncludesDescendants`、`TestHolderCountsIncludeRetired`（与类别口径故意不同，红→绿要能验）。**DOM 测试**：`holdersTree.test.tsx`（层级、根排序、选中写地址、陈旧 id、窄屏返回、搜索平展带路径、备注可见 —— SC-007）、`holdersDefaultStock.test.tsx`（页头那行可点、按钮按 `holder.default_stock` 禁用、已是默认时禁用并说明）、`holdersCountAgreement.test.tsx`（行尾的数 == 链接文案里的数 == 请求参数）、`categories.test.tsx` 补根分页一条。**红→绿双向验**至少覆盖计数一致性与权限禁用两条。 |
| III | 用户体验一致性 | 全部来自 shadcn/ui：`Button`、`Badge`、`Input`、`Label`、`Empty`、`Dialog`、`Alert`、`Field*`、`Select`、`Skeleton`/`Spinner`。**无自定义组件**，无需开发者事先确认。右栏「设为默认库存点」是 024 决策 12「右栏只读」的**一处明确例外**，理由写进 spec FR-020 与 `docs/rules/`：它是独立权限 `holder.default_stock`，与 `holder.update` 共用入口就会让人勾了才发现不行。无权限**禁用 + 悬停说明**（024 决策 13）。 |
| IV | 性能要求 | **去掉一处 N+1**：`usage` 不再为每一行预取，改为打开删除确认时问那一个。**新增一条批量计数**（一条递归 CTE，替代 N 次请求）。`holder_entities.parent_id` 上无索引，但该表量级为几十到几百、最深三层，递归展开的行数与表大小同阶 —— 不加索引，若将来量级变化再说。前端 bundle：新增四个小文件，`Holders` 仍是 lazy chunk，`CrudPage` 的引用从这一页移除。 |
| V | 语言规范 | 文档中文、代码英文。**新增用户可见文案**（两种语言都要）：`holders.searchHint`、`holders.selectHint`、`holders.notFound(+Hint)`、`holders.noMatches(+Hint)`、`holders.defaultStockIs(name)`、`holders.defaultStockNone`、`holders.setDefaultStock`、`holders.alreadyDefaultStock`、`holders.deviceCount(n)`、`holders.viewAssets(n)`、`holders.typeOf`。**删除**：`holders.filterType`、`holders.filterStock`（两个筛选去掉后成孤儿）。 |

**技术栈约束**：后端 Go + Gin + SQLite（`BEGIN IMMEDIATE` / WAL / 写连接池 = 1）+ goose；
前端 Vite + React + TypeScript + react-router + Tailwind CSS + shadcn/ui + TanStack Query。
**本轮无偏离**，Complexity Tracking 为空。

## Project Structure

### Documentation (this feature)

```text
specs/028-master-detail-holders/
├── plan.md              # 本文件
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   └── holders-counts.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks 产出，本命令不写
```

### Source Code (repository root)

```text
internal/
├── asset/
│   ├── overview.go          # + SubtreeCountsByHolder（递归 CTE，不按状态过滤）
│   └── query.go             # + ListFilter.IncludeHolderDescendants，filterClause 里的 CTE 子查询
└── httpapi/
    ├── handlers_holders.go  # + GET /holders/counts
    ├── handlers_assets.go   # 读 holder_include_descendants
    ├── routes.go            # 挂新路由
    └── docs/openapi.yaml    # 合约（与 specs/001 的副本同步）

web/src/
├── routes/
│   ├── Holders.tsx          # 重写：MasterDetail，不再用 CrudPage
│   └── router.tsx           # + /holders/:id
└── features/holders/        # 新目录
    ├── holderRows.ts        # flattenHolders / searchHolders / rootIDOf（走 parent_id）
    ├── HolderTree.tsx       # 左栏：Rail + RailRow + TreePager + useFoldable
    ├── HolderDetail.tsx     # 右栏：属性带 + 备注 + 链接 + 两个按钮
    └── HolderEditor.tsx     # 从 Holders.tsx 搬出的编辑对话框（含删除与 blockers）

web/tests/
├── holdersTree.test.tsx
├── holdersDefaultStock.test.tsx
├── holdersCountAgreement.test.tsx
├── holderHierarchy.test.tsx # 改写：表格断言换成树与对话框
└── categories.test.tsx      # + 根分页一条

docs/rules/
├── web-tables.md            # 改写 152 那段；写明两种「有多少台」
└── domain.md                # 持有方计数口径
```

**Structure Decision**: 沿用仓库既有布局 —— 后端按领域分包（`internal/<domain>`），
前端按特性分目录（`web/src/features/<feature>`）+ 路由页（`web/src/routes`）。
持有方新建 `features/holders/`，与 `features/categories/`、`features/fields/`、
`features/models/` 平级，四个主从页的组织方式因此也一致。

## Phase 1 设计要点

1. **计数与筛选必须同源可验**。两处 SQL 各写各的，靠
   `TestHolderCountsAgreeWithTheFilteredList` 对**每一个**持有方比对 —— 各自算错有可能，
   算成同一个错没有可能。
2. **`include_descendants` 对持有方默认 false**。类别那个默认 true，但持有方的
   `holder_id` 在既有筛选栏里一直是「就这一个」，改默认值会静默改变所有现存链接的含义。
3. **`useMasterSelection` 传全部持有方的 id，不是本页的**（025 已写过这条）。
4. **右栏的例外要写在代码注释里**，不只写在 spec：下一个读 `HolderDetail` 的人会拿它
   和 `CategoryDetail` 比，看到一个可写按钮却找不到理由。

## Complexity Tracking

无违规，本节为空。
