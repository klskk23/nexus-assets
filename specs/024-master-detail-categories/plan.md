# 实施计划：类别页主从两栏与骨架

**规格**：[spec.md](./spec.md) ｜ **调研**：[research.md](./research.md)
**分支**：`024-master-detail-categories` ｜ **决策**：151–160

## Technical Context

| | |
|---|---|
| 服务端 | Go 1.26、Gin、modernc SQLite（`CGO_ENABLED=0`） |
| 前端 | React 19、Vite 6、Tailwind v4、shadcn/ui、TanStack Query v5、react-router v7 |
| 测试 | `go test ./...`、Vitest 3 + RTL（`--maxWorkers=4`） |
| 新依赖 | **无。** 不新增 shadcn 组件，不新增 npm 包 |
| 迁移 | **无。** 不动表结构 |
| 新端点 | `GET /categories/counts` 一个 |
| 新路由 | `/categories/:id`（与 `/categories` 同一组件） |

## Constitution Check

| 原则 / 门禁 | 本轮 |
|---|---|
| 组件来自 shadcn/ui | ✅ 无新组件。骨架是布局与钩子，不是控件（调研五） |
| 前端测试含 DOM 测试 | ✅ 触及 UI，DOM 测试是主要手段 |
| 文案两种语言 | ✅ 新文案进 `zh.ts`/`en.ts`（`en.ts` 由 `typeof zh` 约束） |
| 七条合并门禁 | ✅ **本轮服务端有改动，`gofmt`/`go vet`/`go test`/`nexus verify` 要真跑** |
| 核心管线覆盖率 ≥80% | ✅ 新增的计数归并属于核心，单元测试直达 |
| 读默认全开放 | ✅ `/categories/counts` 不设权限，与 `/categories` 一致 |
| 前端只负责禁用 | ✅ FR-015，把关仍在路由的 `need(...)` |

### Complexity Tracking

**唯一需要辩护的是「为一个调用方抽骨架」。**

通常的判断是「三次才抽」。这里提前抽，因为开发者已经明确后续其他页会走同样的形状 ——
但**提前抽的风险恰恰是 `CrudPage` 的病历**：为想象中的调用方开参数，最后每个调用方
都要一个开关。

所以本轮的抽象**只拿形状不拿内容**，并接受一条明确的代价：**第二个调用方进来时，
很可能要加一个「左栏宽度」参数**（调研四已写明）。那是十行改动、不影响既有行为，
比现在就把参数开满便宜得多。

FR-018 把这条变成可检验的：**骨架源码里不允许出现「类别」「树」「计数」**。

## Phase 0：调研

见 [research.md](./research.md)。五个问题都已定论，无 NEEDS CLARIFICATION。

初稿里有一处被自己验掉的错：`AncestorIDs` 已含类别自身，原写法会让每个类别自算两遍。

## Phase 1：设计

### 服务端

**`internal/asset/overview.go`**
- 新增 `SubtreeCountsByCategory(ctx) (map[string]int, error)`：直挂数按 `path` 归并到
  链上每一个类别（自己 + 全部祖先），排除 `counts_as_available = 0` 的状态。
- **`Overview()` 改为读它**：根类别的数字取 `subtree[rootID]`，删掉现在那段自己做的
  归并（`roots[ids[0]].Count += n`）。**这是 FR-007 的实现方式** —— 两处不是口径一致，
  是同一份结果被读了两次。

**`internal/httpapi/`**
- `GET /categories/counts` → `map[string]int`，无权限守卫。
- `deploy/smoke.sh` 与两份 `openapi.yaml`（`specs/001-*/contracts/` 与
  `internal/httpapi/docs/`）**都要加**，有测试比对这两份。

### 前端

**新增（骨架，`features/common/`）**
- `MasterDetail.tsx`：两栏栅格（左 300px 固定、右 `minmax(0,1fr)`）、各自滚动、
  窄屏塌一栏。入参只有 `selected: boolean` 与 `list` / `detail` 两个 `ReactNode`。
- `useMasterSelection.ts`：给定 `ids` 与当前 `id`，回答「当前选中谁」与
  「未选中时该跳到哪一条」。**不碰条目的形状。**

**新增（类别页自己的，`features/categories/`）**
- `CategoryTree.tsx`：左栏内容 —— 行、缩进、计数、选中态、搜索时切平展。
  复用 `CategoryTable.tsx` 里已经是纯函数的 `flattenCategories`（`collapsed` 传空数组）
  与 `searchCategories`。
- `CategoryDetail.tsx`：右栏内容 —— 属性带、设备列表入口、只读字段表、「修改」按钮。

**改动**
- `routes/Categories.tsx`：从 `CrudPage` 形状改为 `MasterDetail` + 上面两个。
- `routes/router.tsx`：加 `categories/:id`。
- `routes/Overview.tsx`：不动（服务端换了实现，形状不变）。

**删除**
- `features/categories/CategoryTable.tsx` 的表格部分与折叠状态；两个纯函数搬进
  `CategoryTree.tsx`（或留在原文件仅导出函数 —— 由实现时哪种改动更小决定）。
- 右键菜单里的「展开子类别 / 折叠子类别」。

### 契约

见 [contracts/categories-counts.yaml](./contracts/categories-counts.yaml)。

## Phase 2：任务

见 [tasks.md](./tasks.md)。

## 风险

| 风险 | 处置 |
|---|---|
| **计数归并算错，且从数字上看不出来** | 调研二列出的两条测试（根类别算自己、每层只加一次）先写后实现 |
| **概览与类别页悄悄漂移** | 不靠纪律：概览改为读同一份结果。另有一条测试同时读两条路径**互相比较**（FR-007），而不是各自比常量 |
| **骨架长成第二个 `CrudPage`** | FR-018 的语法约束 + 本轮只允许一个调用方（FR-019） |
| **自动选中造成后退循环** | `<Navigate replace>`，并有测试 |
| **删掉当前选中的类别后停在不存在的类别上** | FR-024，验收场景已写死 |
