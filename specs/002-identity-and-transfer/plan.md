# Implementation Plan: 编号模型重构与流转补全

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-identity-and-transfer/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

把编号从「类别的一项设置」改造成「信息项库里的一个普通条目」，并补齐 001 交付后暴露的
三处功能缺口（详情页流转、型号绑定、默认库存点）。

001 把编号规则放在了 `categories.sn_template` 上，于是每个类别都被迫回答一个它不该回答的
问题：没配规则的类别一台设备也存不进去。根因是**位置放错了** —— 编号本质上就是一个由其他
信息项推导出来的信息项，`computed` 字段类型早已具备全部能力。本计划不新建机制，
而是把 `sn` 这个特例并回通用路径，并把随之而来的三处护栏补齐。

技术选型全部沿用 001，本计划不重新论证。要解决的是四件事：
**把决策 25–40 落成可执行的改动清单**、**设计一张能同时承担唯一性校验、精确匹配与历史值的
派生表**、**把「配置错误」的发现时机从录入时提前到配置时**、以及**逐条重新核对章程门禁**
（其中一条的成立理由被本特性改变了）。

## Technical Context

**Language/Version**: 同 001 —— Go 1.26；TypeScript 5.x + React 19

**Primary Dependencies**: **无新增依赖**。后端全部改动落在既有包内；前端复用已引入的
shadcn/ui `Dialog`，未新增任何组件

**Storage**: SQLite 单文件，同 001。本特性新增一次迁移 `migrations/002_identity.sql`：
重建 `assets`（去 `sn` 列）、改写 `categories`（去 `sn_template`、加 `display_key`）、
新建 `asset_unique_values` 及其三个索引、删除 `asset_sn_history` 与 `ix_assets_mac`

**Testing**: 同 001。本特性新增 17 个 Go 用例与 9 个 DOM 用例，
并把三处新护栏的测试落在 `internal/schema` 包内（跨包测试不计入该包覆盖率）

**Target Platform**: 同 001

**Project Type**: 同 001

**Performance Goals**: 同 001。本特性把精确匹配从「按字段硬编码的多次探测」改为
「一张索引表上的一次查询」，不放宽任何既有预算

**Constraints**: 迁移必须能在已有数据的库上跑通并可回滚；`assets.sn` 带 UNIQUE 约束，
SQLite 无法直接 `DROP COLUMN`，必须走表重建；重建期间外键必须临时关闭，
因而该迁移不能包在事务里

**Scale/Scope**: 5 个用户故事、31 条功能需求、1 次迁移、约 70 个文件的改动。
API 表面净减 0 个端点（`recompute-sn` 改名为 `recompute`）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v1.1.0。**必须逐条填写符合情况，不得以「通过」一词概括。**

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：绑定门禁全部落在 `internal/schema`（`deps.go` 的依赖闭包 + `binding.go` 的三处判定），`internal/httpapi` 只做错误映射。**圈复杂度**：新增的 `checkBindDeps` 与 `syncUniqueValues` 各自单一职责，均远低于 15；`Save` 管线由 10 步收缩为 9 步，`Prepare`/`Persist` 的拆分不变。**新增依赖**：零。前端的流转弹层用已引入的 shadcn `Dialog`，型号选择器用原生 `select`（与页内其余下拉一致） |
| II | 测试标准 | **核心管线**：`internal/schema` 新增 `deps_test.go` 覆盖依赖闭包、三方向门禁与模板改写复检；`internal/asset` 新增显示编号回退、唯一值归档与冲突指向的用例；`internal/store` 新增部分唯一索引行为与迁移回滚的用例。**端点集成测试**：改动到的端点逐个覆盖，含一条专门断言「英文哨兵不出现在响应里」。**DOM 测试**：新增 `displayKey.test.tsx`、`modelPicker.test.tsx`，并在 `assetDetail.test.tsx` 增加两条流转用例、在 `metadata.test.tsx` 增加两条默认库存点用例。**覆盖率**：核心五包 81.2%（门禁 ≥ 80%） |
| III | 用户体验一致性 | 全部组件取自 shadcn/ui，**自定义组件仍为 0**。流转弹层用 `Dialog`；型号覆盖确认同样用 `Dialog`；显示编号选择器与页内其余下拉保持同一形态。**一致性的主要工作在这里**：详情页与列表页原本会成为同一操作的两种交互，故把弹层做成共享组件，列表页的按钮改为「打开同一弹层并预选动作」，两处行为不可能再分叉。三态与二次确认沿用 001 的约定 |
| IV | 性能要求 | **无 N+1**：列表页解析显示编号需要各类别的 `display_key`，用一次 `DisplayKeys()` 取全量映射，与行数无关；重算把型号查询从每行一次改为一次性载入。**索引**：新增 `ux_uv_live`（部分唯一）、`ix_uv_value`、`ix_uv_asset`；删除 `ix_assets_mac`（其职责由前者承担）。**精确匹配**从多条按字段硬编码的查询变为最多三条索引查询。**bundle**：新增 `dialog` chunk 10.63 KB gzip，主 chunk 123.69 KB，仍在 500KB 预算内 |
| V | 语言规范 | 同 001 的划分。**本特性额外修掉了一处既有违反**：`FailErr` 把 `err.Error()` 整个透传，导致哨兵错误的英文标识（`holder entity is still referenced: `）出现在中文提示前面。新增 `userText()` 剥掉该前缀，并把三条纯英文的领域错误消息改为中文（FR-031） |

**技术栈约束**：无变化，无新增依赖，无偏离。

**Gate 结论（Phase 0 前）**：五项原则全部通过。有一条需要在设计后复核 ——
「SQLite 写事务一律 `BEGIN IMMEDIATE`、写连接池为 1」这条硬规则在章程里的**理由**是
「应用层唯一性校验成立的前提」，而本特性把唯一性移交给数据库约束，该理由不再成立。

**Gate 结论（Phase 1 设计后）**：通过。上述条目经复核后**保持设置不变、更新理由**：
写连接池为 1 从正确性前提降级为性能选择，放宽它没有收益（单文件 SQLite 的写入本就串行）。
已在 `CLAUDE.md` 的硬规则清单中改写措辞，并新增一条关于「`assets` 没有 `sn` 列」的提醒。
设计过程中新增的三条派生规则（依赖必填强制、归档值可被重新占用、模板改写复检）
均未引入章程偏离，已记入 data-model.md 与 research.md。

## Project Structure

### Documentation (this feature)

```text
specs/002-identity-and-transfer/
├── spec.md              # 功能规格（/speckit-specify 产出）
├── plan.md              # 本文件（/speckit-plan 产出）
├── research.md          # Phase 0 产出：8 项实现级决策
├── data-model.md        # Phase 1 产出：迁移增量、管线变化、不变量
├── quickstart.md        # Phase 1 产出：新模型下的配置顺序与验证方式
├── checklists/
│   └── requirements.md  # 规格质量检查清单
├── contracts/           # Phase 1 产出
│   ├── README.md        # 相对 001 的契约增量说明
│   └── openapi.yaml     # 变更端点的契约（增量，非全量）
└── tasks.md             # Phase 2 产出（/speckit-tasks，本命令不创建）
```

### Source Code (repository root)

改动落在 001 已建立的结构内，**不新增包**。下表只列出本特性触及的位置：

```text
migrations/
└── 002_identity.sql     # 新增：表重建 + display_key + asset_unique_values

internal/
├── model/model.go       # Asset.SN → DisplayName（派生，不落库）；
│                        # Category.SNTemplate → DisplayKey；
│                        # 新增 ShortID() 与 AssetDisplayName()
├── schema/
│   ├── deps.go          # 新增：DependencyClosure —— 表达式键的递归依赖闭包
│   ├── binding.go       # 新增 checkBindDeps / checkUnbindSafe 两处门禁
│   ├── field_store.go   # 新增 recheckBoundCategories —— 模板改写后复检
│   ├── category_store.go# sn_template → display_key，新增 validateDisplayKey
│   ├── refcheck.go      # Referrer 增加 display_key 种类；移除 sn_template 分支
│   └── resolve.go       # 移除 ResolveSNTemplate
├── asset/
│   ├── pipeline.go      # 管线 10 步 → 9 步；ID 提前到 Prepare 分配
│   ├── persist.go       # checkUnique → probeUnique + syncUniqueValues
│   ├── query.go         # 精确匹配改走唯一值表；SNHistory → ValueHistory
│   └── recompute.go     # RecomputeSN → Recompute（对象扩大到全部表达式键）
├── holder/
│   ├── store.go         # Archive 不再清除默认库存点标记，改为拒绝
│   └── refcheck.go      # Blocker.SN → Blocker.Name
├── httpapi/
│   ├── errors.go        # 新增 userText()，剥掉哨兵前缀
│   ├── handlers_*.go    # display_key / confirm / recompute / value_history
│   └── messages.go      # 新增 MsgDefaultStockRequired
└── ...

cmd/nexus/
├── seed.go              # 按新模型建种子数据（sn 成为表达式键）
└── verify.go            # 新增唯一值双向对帐

web/src/
├── features/
│   ├── transfers/TransferDialog.tsx   # 新增：详情页与列表页共用
│   ├── assets/ActionBar.tsx           # 改为「打开共享弹层并预选动作」
│   ├── assets/ModelPicker.tsx         # 新增：型号选择与覆盖确认
│   └── categories/DisplayKeyEditor.tsx# 取代 SnTemplateEditor
└── routes/              # AssetDetail / NewAsset / Categories / Fields / Holders / Import
```

**Structure Decision**: 不新增任何包。本特性的性质是**把一个特例并回通用路径**，
新增包会与这个目标相悖 —— `sn` 之所以需要特殊处理，正是因为它当初被放在了信息项体系之外。

唯一一个值得单独成文件的是 `internal/schema/deps.go`：依赖闭包是三处门禁共用的判定基础
（绑定、解绑、模板改写），放在 `binding.go` 里会让那个文件承担两件不同层次的事。

前端新增三个组件，全部落在既有的 `features/<领域>/` 划分下。`TransferDialog` 放在
`features/transfers/` 而非 `features/assets/`，因为它属于流转领域，被资产的两个页面调用。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**当前无章程违反项。**

### 边界登记：不是违反，但会触及章程边界，预先记录以免实现时临场判断

| 事项 | 性质 | 处置 |
|------|------|------|
| 迁移 `002_identity.sql` 不在事务内执行 | 数据安全边界 | SQLite 重建带 UNIQUE 约束的表必须 `PRAGMA foreign_keys=off`，而该 pragma 在事务内是空操作。故使用 goose 的 `NO TRANSACTION`，并在迁移内自行保证顺序。风险由「Down 迁移完整还原 001 形态」的用例覆盖（见 research.md D2） |
| 领域层错误消息使用中文 | 原则 V 边界 | 章程要求代码与注释英文、用户可见文案中文。领域层的哨兵错误其**标识部分**是英文（供 `errors.Is` 判定），**说明部分**是中文（直接呈现给用户）。这沿用 001 已有的 `describeBlockers` 做法，不是新的偏离；本特性额外加了 `userText()` 保证英文标识不会漏到界面上 |
| 唯一性由数据库约束保证后，写连接池为 1 的理由改变 | 章程条文的理由过期 | 设置本身不变，理由从「正确性前提」改为「性能选择」。已更新 `CLAUDE.md` 的措辞。**未修订章程本身** —— 因为该条约束的结论没有变化，只有论据变了，不构成需要走修订流程的偏离 |
| 归档的唯一值允许被另一台设备重新占用 | 推翻了 001 决策 12 的一半 | 001 规定「编号不可重用」，理由是防止旧标签指向别的设备。推广到全部唯一字段后该规则会误伤真实场景（换主板后旧 MAC 转移）。改为允许，代价是精确匹配可能命中多条 —— 此时退化为列表而非误跳转（见 research.md D4） |
