# 实施计划：审计分栏、流转可查、筛选可搜

**分支**：`023-audit-split-and-searchable-filters` ｜ **规格**：[spec.md](./spec.md) ｜ **决策**：142–150

## 概要

四块，依赖单向：**权限 → 服务端 → 审计分栏 → 两张表**，可搜筛选独立于其余三块。

| | 内容 | 主要位置 |
|---|---|---|
| **A** | 新增 `transfer.audit` 开关 + 迁移 + 厂商权限改归属 | `internal/authz`、`internal/httpapi`、`migrations/019`、前端权限表与两份 i18n |
| **B** | `GET /transfers` + `Transfer` 带上可读编号 | `internal/transfer`、`internal/httpapi`、合约、冒烟脚本 |
| **C** | `/audit` 与 `/audit/transfers` 两条路由 + 页签 | `routes/Audit.tsx`、新 `routes/TransferAudit.tsx`、`router.tsx`、`MetadataTabs` |
| **D** | 概览与详情的两张流转表 | `routes/Overview.tsx`、`routes/AssetDetail.tsx` |
| **E** | 可搜下拉（Command + cmdk） | `components/ui/command.tsx`、新 `features/common/SearchSelect.tsx` + 四处调用 |

调研（[research.md](./research.md)）定下四条，其中一条推翻了规格里的需求：

1. **编号不是列，是算出来的** → 筛选走 `asset_unique_values`（资产搜索已有的子查询），
   显示在 Go 里按页算一次
2. **流转随资产级联删除** → 「删除后仍可读」是伪需求，已从规格删去
3. **迁移可以用 JSON1 精确表达**，且**管理员靠 `is_admin` 自动获得新开关**
4. **两栏必须是两条路由**（016 决策 107），`MetadataTabs` 是现成解

## 技术背景

| | |
|---|---|
| 服务端 | Go 1.26 · Gin · modernc SQLite（`CGO_ENABLED=0`）· goose |
| 前端 | React 19 · Vite 6 · Tailwind v4 · shadcn/ui · TanStack Query v5 |
| 新依赖 | **`cmdk`**（shadcn Command 的底层），前端唯一新增 |
| 迁移 | `migrations/019_transfer_audit_permission.sql` |
| 契约 | `specs/001-*/contracts/openapi.yaml` 与 `deploy/smoke.sh` 必须同步 |

**没有 NEEDS CLARIFICATION。** 20 条裁定在 `/grill-me` 逐条决断。

## 章程检查

依据 `.specify/memory/constitution.md` v1.2.0。

| # | 原则 | 符合情况 |
|---|------|----------|
| **I** 代码质量 | 新增一个端点、一个迁移、一个共享组件；`Timeline` 从两处用降为一处（概览改表格），职责因此变清楚。厂商权限改归属是**减少**一处名不副实的授权 |
| **II** 测试标准 | **服务端有改动，覆盖率门禁真的适用**：新查询落在 `internal/transfer`，权限落在 `internal/authz`。迁移要有自己的测试（SC-001 写死了「迁移被还原时会失败」）。前端四个用户故事都有可测行为，**不登记无 DOM 测试的偏离** |
| **III** UX 一致性 | 两栏用既有的 `MetadataTabs` 形态；两张表用既有的 `TableFrame`；更正入口改右键，正是产品第三条判断（「单元格里不放可点击控件」）。**新增一条判断**：候选多的下拉可搜，候选少的不必 |
| **IV** 性能要求 | 新端点分页；编号解析**每页一次**而非每行一次（照搬资产列表的做法）；筛选全部落在 SQL，不在 Go 里过滤后分页 |
| **V** 语言规范 | 新增文案（权限名、页签名、筛选标签、空态）两份目录同步；`error.code` 与键名不翻译 |

## Complexity Tracking（章程偏离登记）

| 违反项 | 必需性理由 | 被拒绝的更简方案 |
|---|---|---|
| **「组件必须来自 shadcn/ui。不存在时必须先与开发者确认才能自定义，不接受事后补批」** —— 本轮引入 `Command` 组件与 `cmdk` 依赖 | `Command` **就是** shadcn 的组件，Combobox 是 shadcn 官方由 Popover + Command 组合的形态；**开发者已在 `/grill-me` 中明确点头**（问题「可搜索下拉怎么做」→「加 shadcn Command + cmdk」），是事前确认 | **在 `Select` 里塞输入框**：不加依赖，但 Radix `Select` 内建按首字母跳转的 typeahead 会与输入框抢按键 —— 这正是 shadcn 不用 Select 做 Combobox 的原因。**已在 grill 中作为选项摆出并被否决** |

**本轮只有这一条。** 原则二不登记偏离 —— 四个用户故事都有可测行为。

## 项目结构

```text
specs/023-audit-split-and-searchable-filters/
├── spec.md              规格（取代 016 FR-027 的厂商部分、014 的审计单栏）
├── plan.md              本文件
├── research.md          Phase 0：四个问题，其中一个证伪了规格里的需求
├── quickstart.md        Phase 1：实机走查
└── checklists/
    └── requirements.md  规格质量检查单
```

**没有 `data-model.md`**：不引入新实体，`asset_transfers` 表一列不加。
**有契约改动**：`GET /transfers` 要进 001 的 `openapi.yaml`。

### 源码

```text
migrations/019_transfer_audit_permission.sql   给带 audit.read 的角色补上新开关（可重复执行）
internal/authz/permissions.go                  常量 + All
internal/httpapi/permissions.go                名称表
internal/httpapi/server.go                     GET /transfers 守 transfer.audit；厂商 CRUD 改守 ModelManage
internal/transfer/query.go（新）                列表查询：四个筛选 + 分页 + 每页解析编号
internal/transfer/*.go                         Transfer 带 AssetDisplayName
web/src/features/auth/usePermissions.ts        PERMISSIONS
web/src/i18n/{zh,en}.ts                        perm.names + 新页面文案
web/src/components/ui/command.tsx（新）         shadcn
web/src/features/common/SearchSelect.tsx（新）  Popover + Command 的可搜下拉
web/src/routes/TransferAudit.tsx（新）          流转审计
web/src/routes/{Audit,Overview,AssetDetail,router}.tsx
web/src/features/metadata/MetadataTabs.tsx     加 audit 组
docs/rules/{schema,web-tables,auth}.md         厂商权限、审计两栏、可搜下拉的判据
deploy/smoke.sh + specs/001-*/contracts/openapi.yaml
```

## 阶段

### 第 0 阶段：调研 ✅
见 [research.md](./research.md)。

### 第 1 阶段：设计 ✅
[quickstart.md](./quickstart.md)。

### 第 2 阶段：实施顺序

**A 先做，且迁移的测试先于迁移** —— 它是唯一一处做错会收回别人已有能力的地方：

```
A1 迁移的测试（造一个只带 audit.read 的角色 → 迁移后两个都有）← 先看它红
A2 migrations/019 + 权限常量与名称表 + 前端 PERMISSIONS + 两份 i18n（四处齐改）
A3 厂商 CRUD 改守 ModelManage，绑定不动
   ↓
B1 Transfer 带 AssetDisplayName（每页解析一次）
B2 GET /transfers：四个筛选 + 分页 + 时间倒序
B3 契约与冒烟脚本同步
   ↓
C1 路由 /audit/transfers + MetadataTabs 加 audit 组
C2 只有一种权限时落到有权的那一栏、另一栏不出现
   ↓
D1 概览的最近流转 → 表格（带资产列）
D2 详情的流转历史 → 表格（不带资产列）+ 更正改右键
   ↓
E1 command.tsx + cmdk
E2 SearchSelect + 四处替换（类别搜索时显示完整路径）
   ↓
门禁全跑：go test / gofmt / vet / lint / nexus verify / vitest / build
```

**A1 先于 A2 不是形式**：迁移正确与否**无法靠事后观察发现** —— 等有人报
「我看不到审计了」已经晚了，而那时数据已经迁完。

## 风险

| 风险 | 应对 |
|---|---|
| **权限漏登记一处，界面认为无人拥有它** | CLAUDE.md 点名的四处写成一条任务（A2），并加一条测试断言四处一致 |
| **迁移把人的权限改没了** | A1 先写测试再写迁移；迁移用 `NOT EXISTS` 保证可重复执行 |
| **编号筛选在 Go 里过滤后再分页** | research 问题一已否决该做法；筛选必须落在 SQL，总数由 `count(*)` 得出 |
| **每行解析一次编号** | 照搬资产列表的「每页一张 display_key 表」，语句数与行数无关 |
| **两栏挤进一个地址互相踩** | 两条路由，`MetadataTabs` 形态；016 决策 107 已成文 |
| **cmdk 与 Radix 的键盘行为打架** | 用 shadcn 官方的 Popover + Command 组合，不自造；键盘全流程写进走查 |
| **服务端门禁被再次略过** | FR-027 与 SC-008 写成验收；前四轮都是「服务端零改动」，习惯性略过是真实风险 |
| **半成品被误发布** | 017–022 的 60 个提交仍未推，023 在其上继续；不打 tag、不合 main、不推送 |
