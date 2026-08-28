# Implementation Plan: 资产台账与流转系统 Demo

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-asset-ledger-demo/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

交付一套内部路由设备资产台账与流转系统的第一版 demo：资产按可自定义的类别与信息项建档、
资产编号由类别规则自动生成、每次持有方/负责人/状态变化都留下不可变的流转记录。

技术路径已由 `docs/design-baseline.md`（v0，21 项已闭合决策）与项目章程（v1.0.1）锁定，
本计划不重新论证选型，只解决三件事：**把已定决策落成可执行的代码结构**、
**补齐设计基线未覆盖的实现级空白**（状态机合法转换、持有方与状态的耦合规则、读写连接池分离、
类别树的组件方案）、以及**逐条核对章程门禁**。

交付形态为单二进制：前端构建产物经 `embed.FS` 打包，Gin 同时服务 `/api` 与静态文件。

## Technical Context

**Language/Version**: Go 1.23+（具体版本锁定于 `go.mod`）；TypeScript 5.x + React 19

**Primary Dependencies**:
后端 — `gin-gonic/gin`、`modernc.org/sqlite`（纯 Go 驱动）、`pressly/goose/v3`、
`coreos/go-oidc/v3` + `golang.org/x/oauth2`、`golang-jwt/jwt/v5`；
前端 — Vite、React、React Router、Tailwind CSS、shadcn/ui、TanStack Query、
`react-router`、`react-hook-form` + `zod`（随 shadcn/ui Form 引入）

**Storage**: SQLite 单文件。WAL 模式，`busy_timeout=5000`，pragma 经 DSN 显式声明。
写连接池大小为 1，读连接池放开（见 research.md 决策 2）

**Testing**: 后端 Go 标准 `testing`（单元 + 端点集成，跑真实临时库）；
前端 Vitest + React Testing Library + jsdom（**必须含 DOM 测试**，章程原则 II）

**Target Platform**: Linux 服务器（公司内网）。`CGO_ENABLED=0` 构建，可直接交叉编译

**Project Type**: web application（backend + frontend，合并为单一可执行文件交付）

**Performance Goals**: 列表查询 p95 < 200ms、单条读写 p95 < 100ms（1 万条种子数据下）；
前端首屏可交互 < 1.5s；初始 chunk < 500KB gzip；交互反馈 < 100ms

**Constraints**: 无 CGO；SQLite 全局单写者（唯一性校验的前提）；JWT 8h 且无 refresh；
本版不做权限区分；导入仅新增不更新；有资产的类别节点不可移动

**Scale/Scope**: 万级资产、十人级并发。6 个用户故事、73 条功能需求、
9 张数据表、约 26 个 HTTP 端点、11 条前端路由

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v1.1.0。**必须逐条填写符合情况，不得以「通过」一词概括。**

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：`internal/httpapi` 仅做绑定、调用与错误 envelope 转换；保存管线全部在 `internal/asset`。**圈复杂度**：10 步保存管线拆为独立的 stage 函数（`resolveFields` / `normalize` / `validate` / `evalComputed` / `evalSN` / `checkUnique` / `archiveSN` / `write` / `emitTransfer`），由一个编排函数串起，单函数均远低于 15。**新增依赖**：gin、modernc.org/sqlite、goose、go-oidc、oauth2、jwt 六个后端依赖，全部由章程「技术栈约束」直接指定，无自选依赖 |
| II | 测试标准 | **核心管线六块**全部落在 `internal/schema`（继承字段集解析）、`internal/asset`（MAC 规范化、唯一性校验、SN 重算与冲突回滚）、`internal/compute`（拓扑求值与环检测）、`cmd/nexus`（verify 对帐），这四个包覆盖率目标 ≥ 80%。**端点集成测试**：26 个端点逐个覆盖，跑 `t.TempDir()` 下的真实 SQLite 文件，不 mock 存储层。**DOM 测试**：11 条路由每条至少一条；重点覆盖动态表单渲染（由 schema 驱动）、多选动作条批量提交、导入预览错误逐行展示、乐观锁 409 提示。**verify 进 CI** |
| III | 用户体验一致性 | 全部组件取自 shadcn/ui。**已核对的缺口与解法**：类别树与持有方树 → 用 `Collapsible` + `Button` 递归组合，不引入自定义树组件；流转时间线 → `Card` + `Separator` + Tailwind 排版；多选动作条 → `Card` 固定定位；概览的类别分布 → `Progress` + 列表（**不用 shadcn Chart**，避免 Recharts 撑破 500KB 初始 chunk 预算，见原则 IV）。**三态**（加载/空/错误）由一个共享的渲染约定强制，11 条路由逐条验收。**二次确认**用 `AlertDialog`，删除资产要求输入 SN。**待确认风险见下方 Complexity Tracking** |
| IV | 性能要求 | **无 N+1**：列表页一次取 N 行资产后，收集 `holder_id`/`owner_id`/`model_id` 三组 ID，各发一条 `IN` 查询批量取名，总计常数条 SQL。**新增索引**：`assets(category_id,status)`、`assets(owner_id)`、`assets(holder_type,holder_id)`、`assets(json_extract(attrs,'$.mac'))`、`categories(path)`、`asset_transfers(asset_id,created_at DESC)`、`asset_transfers(batch_id)`、`asset_sn_history(sn)`。**分页**强制，`limit` 默认 50 上限 200。**bundle**：不引入图表库；路由级 code-splitting，管理类页面懒加载 |
| V | 语言规范 | **中文**：`specs/**`、`docs/**`、PR 描述。**英文**：Go/TS 标识符与注释、commit message、日志、`error.code`（snake_case）、表名与字段 key、API 路径与查询参数。**i18n 例外清单**：UI 文案、`field_definitions.label`、enum 选项 `label`、`error.message`、导入预览的逐行错误提示、五种状态的显示名 —— 全部集中在 `web/src/i18n/zh.ts` 与后端的 `internal/httpapi/messages.go`，不散落在业务逻辑中 |

**技术栈约束**：后端 Go + Gin + SQLite（`BEGIN IMMEDIATE` / WAL / 写连接池 = 1）+ goose；
前端 Vite + React + TypeScript + react-router + Tailwind CSS + shadcn/ui + TanStack Query。
偏离必须在下方 Complexity Tracking 中登记。

**Gate 结论（Phase 0 前）**：曾因一项技术栈约束缺口未通过 —— 章程「技术栈约束 → 前端」
未列出路由库，而 11 条路由的 SPA 必须有一个。**该项已于 2026-08-28 由章程 v1.1.0 修订解除**
（新增 `react-router` 为强制依赖，见 research.md 决策 D10）。现五项原则全部通过。
**Gate 结论（Phase 1 设计后）**：通过。设计过程中新增的三条规则（状态机合法转换、
`in_stock` 与位置的耦合、读写连接池分离）均未引入章程偏离，已记入 data-model.md 与 research.md。

## Project Structure

### Documentation (this feature)

```text
specs/001-asset-ledger-demo/
├── spec.md              # 功能规格（/speckit-specify 产出）
├── plan.md              # 本文件（/speckit-plan 产出）
├── research.md          # Phase 0 产出：8 项实现级决策
├── data-model.md        # Phase 1 产出：9 张表、校验规则、状态机
├── quickstart.md        # Phase 1 产出：开发与构建流程
├── checklists/
│   └── requirements.md  # 规格质量检查清单
├── contracts/           # Phase 1 产出
│   ├── README.md        # 全局 API 约定
│   └── openapi.yaml     # 端点契约
└── tasks.md             # Phase 2 产出（/speckit-tasks，本命令不创建）
```

### Source Code (repository root)

```text
cmd/nexus/
├── main.go              # 启动、配置装载、路由注册、embed 挂载
└── verify.go            # nexus verify 子命令：事件流与物化快照对帐

internal/
├── config/              # 环境变量装载；JWT 密钥缺失时拒绝启动
├── store/               # SQLite 连接（读写双池）、pragma、事务助手、goose 驱动
├── model/               # 领域结构体与枚举（status、field type、transfer kind）
├── schema/              # 类别树解析、有效字段集（祖先并集）、options 契约反序列化
├── compute/             # text/template FuncMap 白名单、模板解析与 if/range 拒绝、
│                        # 引用抽取、DAG 拓扑排序与环检测
├── asset/               # 保存管线各 stage、唯一性校验、SN 求值与重算、批量改类别
├── transfer/            # 单条与批量流转、链尾编辑与留痕、状态机合法性校验
├── holder/              # 持有方实体树、默认库存点、引用完整性检查
├── importer/            # CSV 双行表头模板、预览逐行校验、单事务提交
├── audit/               # 元数据变更留痕
├── auth/                # OIDC 流程、域名白名单、JWT 签发与校验、中间件
└── httpapi/             # gin handlers、错误 envelope、分页、messages.go（中文文案）

migrations/
└── 001_init.sql         # goose 迁移，embed.FS 打包

web/
├── src/
│   ├── routes/          # 11 条路由页面
│   ├── components/
│   │   ├── ui/          # shadcn/ui 生成物
│   │   └── custom/      # 经开发者确认的自定义组件（当前为空）
│   ├── features/        # 按领域组织的业务组件（assets/transfers/categories/...）
│   ├── lib/             # API 客户端、query keys、错误 envelope 解析
│   ├── i18n/zh.ts       # 全部用户可见中文文案
│   └── test/            # 测试工具：QueryClient 包装、渲染助手
├── tests/               # DOM 测试（与 routes/features 对应）
└── dist/                # 构建产物，embed.FS 挂载点（不入库）
```

**Structure Decision**: 采用后端 + 前端并列、但合并交付为单一可执行文件的结构。
目录划分直接取自 `docs/design-baseline.md` 第 9 节，并按本计划补入 `config/`、`model/`、
`holder/` 三个包 —— 前两者是章程原则 I「分层边界」的落地位置（配置装载与领域枚举
不应散落在 handler 或 store 中），`holder/` 承载持有方树与引用完整性检查，
这部分逻辑在设计基线中未单独成包但体量足够独立。

前端不使用 `pages/` 而用 `routes/` + `features/`：路由页面只做布局与数据编排，
业务组件按领域聚合，使 DOM 测试可以对着 `features/` 里的组件写而不必每次挂载整条路由。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**当前无章程违反项。** 曾有一项阻塞项，已解除，记录见下。

### 已解除：路由库的技术栈缺口

| 事项 | 处置 |
|------|------|
| 引入 `react-router`，而章程 v1.0.1 的「技术栈约束 → 前端」未列出路由库 | 章程于 2026-08-28 修订至 **v1.1.0**，将 `react-router` 列为强制依赖。被拒绝的替代方案（自行基于 `history` API 实现、改用 `@tanstack/react-router`）记录在 research.md 决策 D10。修订同时澄清了 `react-hook-form` + `zod` 属于 shadcn/ui 生成物，不另计为框架级依赖 |

### 边界登记：不是违反，但会触及章程边界，预先记录以免实现时临场判断

| 事项 | 性质 | 处置 |
|------|------|------|
| shadcn/ui 无专用 Tree 组件 | 原则 III 边界 | 用 `Collapsible` 递归组合实现，属于「使用现有组件」而非自定义组件，**不触发确认流程**。但若实现中发现深层类别树下该方案的可用性不可接受，**必须暂停并与开发者确认**后才能引入自定义树组件 —— 章程原则 III 明写"不接受事后补批" |
| 同一 SQLite 文件开两个 `*sql.DB` | 章程要求的直接后果 | 章程规定写连接池为 1；若只开一个池，读也被串行化，列表页 p95 目标（原则 IV）无从达成。故写池 `SetMaxOpenConns(1)`、读池放开，两者指向同一文件。这是满足章程而非偏离，见 research.md 决策 D3 |
