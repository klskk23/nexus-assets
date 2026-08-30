# Implementation Plan: 信息项生命周期与型号归属

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-field-lifecycle-and-models/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

把「元数据只增不减」这条 001 的原则收窄到它真正要保护的范围，并把型号从单类别归属改为多对多。

001 用「只停用不删除」保护配置类对象，理由是历史数据的可读性。那个理由对**已经产生了数据**
的配置成立，对一个刚建错、没人用过的信息项不成立 —— 但同一条规则把两者一起挡住了。
本计划让系统自己判断这个区别：有数据就拒绝删除，没数据就删干净。

停用因此从信息项上移除。它原本承担的「留着数据但不再要求填写」由**解绑**接手 ——
一个自 001 起就存在、v2 还为它加了护栏、却从来没有路由和界面入口的能力。
本计划必须把它补出来，否则移除停用是净损失。

型号那一侧是一次直接的多对多改造，外加三处让型号在界面上真正可用的补齐。

## Technical Context

**Language/Version**: 同 002 —— Go 1.26；TypeScript 5.x + React 19

**Primary Dependencies**: **无新增依赖**

**Storage**: SQLite 单文件。新增迁移 `migrations/003_field_lifecycle.sql`：
`field_definitions` 去 `archived_at`、`product_models` 去 `category_id` 并改重名约束、
新建 `product_model_categories`

**Testing**: 同 001/002。新增用例覆盖删除的三条拦截线、解绑端点、多对多候选解析、
默认值编辑与套用、以及阻挡列表的渲染

**Target Platform / Project Type / Performance Goals**: 同 001

**Constraints**: 删除判定需要一次全表 `json_extract` 扫描（低频操作，接受）；
`vendor` 参与唯一约束因而必须 `NOT NULL`；表重建仍需关闭外键，迁移不在事务内

**Scale/Scope**: 5 个用户故事、21 条功能需求、1 次迁移、新增 1 个端点（解绑）。
后端约 12 个文件、前端约 8 个文件

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v1.1.0。**必须逐条填写符合情况，不得以「通过」一词概括。**

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：删除的三条拦截线全部落在 `internal/schema`，`internal/httpapi` 只做错误映射与结构化 payload 组装。**圈复杂度**：`DeleteField` 由三个独立的检查函数（引用、显示编号、资产取值）加一个编排组成，各自单一职责。**新增依赖**：零 |
| II | 测试标准 | **核心管线**：删除的三条拦截线、解绑端点、多对多候选解析全部在包内测试（`internal/schema`）。**端点集成测试**：新增的 `DELETE /categories/:id/bindings/:field_id` 与改动到的 `DELETE /fields/:id`、`POST /models` 逐个覆盖。**DOM 测试**：型号默认值编辑器、类别页解绑按钮、持有方阻挡列表三处新 UI 各自有用例；`fieldEditor.test.tsx` 的「停用」改「删除」。**覆盖率**：核心五包维持 ≥ 80% |
| III | 用户体验一致性 | 全部组件取自 shadcn/ui，**自定义组件仍为 0**。默认值编辑器用 `Input` + `Button` 的行列表，不引入表格编辑组件；解绑用 `AlertDialog` 二次确认（破坏性操作）；阻挡列表复用信息项引用列表的呈现形态 —— **这正是本轮修掉的一处不一致**：两处同类护栏此前一处列出对象、一处只给一句话 |
| IV | 性能要求 | **删除判定是一次全表扫描**，这是本特性唯一的新增开销。它发生在删除这一个低频操作上，且必须扫全表才能回答「有没有人填过」。**多对多不引入 N+1**：候选解析一次性载入关联表（型号数量在百级），与资产行数无关。新增索引 `ix_pmc_category`。**bundle**：无新增依赖，无新增 chunk |
| V | 语言规范 | 同 001 的划分。本特性额外修掉两处既有违反：两条文案仍在描述已废弃的行为（FR-019），六条文案没有任何代码引用（FR-020） |

**技术栈约束**：无变化，无新增依赖，无偏离。

**Gate 结论（Phase 0 前）**：五项原则全部通过。

**Gate 结论（Phase 1 设计后）**：通过。设计过程中确认的一条派生规则 ——
「持有方与账号不跟着改为可删除」—— 表面上违反原则 III 的一致性，
实际上三者的约束来源不同（见 research.md D3），已在规格 FR-009 中显式说明理由。
不写理由才是问题：下一个人会以为是漏改。

## Project Structure

### Documentation (this feature)

```text
specs/003-field-lifecycle-and-models/
├── spec.md              # 功能规格（/speckit-specify 产出）
├── plan.md              # 本文件（/speckit-plan 产出）
├── research.md          # Phase 0 产出：6 项实现级决策
├── data-model.md        # Phase 1 产出：迁移增量、删除判定、候选解析
├── quickstart.md        # Phase 1 产出：新生命周期下的操作路径
├── checklists/
│   └── requirements.md  # 规格质量检查清单
├── contracts/           # Phase 1 产出
│   ├── README.md        # 相对 001/002 的契约增量说明
│   └── openapi.yaml     # 变更与新增端点的契约（增量）
└── tasks.md             # Phase 2 产出（/speckit-tasks，本命令不创建）
```

### Source Code (repository root)

不新增包。下表只列出本特性触及的位置：

```text
migrations/
└── 003_field_lifecycle.sql   # 新增：去 archived_at、型号多对多

internal/
├── model/model.go            # FieldDefinition 去 ArchivedAt；
│                             # ProductModel 去 CategoryID，加 CategoryIDs
├── schema/
│   ├── field_store.go        # ArchiveField → DeleteField；UpdateFieldInput 去 Archive
│   ├── refcheck.go           # 引用检查从停用路径搬到删除路径，新增资产取值检查
│   ├── binding.go            # loadLibrary/loadChain 去掉 archived_at 过滤
│   ├── model_store.go        # 多对多的读写；候选按类别链解析
│   └── resolve.go            # ActiveFields 退化后的处置
├── importer/resolve.go       # 型号按名称解析，歧义报错
└── httpapi/
    ├── server.go             # 新增 DELETE /categories/:id/bindings/:field_id
    ├── handlers_metadata.go  # deleteField / unbindField / 型号的多对多入参
    └── messages.go           # 删除相关文案

cmd/nexus/seed.go             # 建一个带默认值、关联两个类别的型号

web/src/
├── lib/api.ts                # ApiError 解析 blockers
├── lib/metaTypes.ts          # ProductModelRow 的 category_ids
├── features/fields/FieldEditor.tsx      # 停用 → 删除
├── features/metadata/AttrDefaultsEditor.tsx  # 新增：默认值行编辑
├── routes/Categories.tsx     # 解绑按钮
├── routes/Models.tsx         # 多类别选择 + 默认值编辑
├── routes/Holders.tsx        # 阻挡设备列表
└── i18n/zh.ts                # 文案对齐
```

**Structure Decision**: 唯一新增的前端文件是 `AttrDefaultsEditor.tsx`。
它放在 `features/metadata/` 而非 `features/assets/`：默认值是型号这个**元数据**的一部分，
编辑它的人是管理员而不是录入设备的人。`ModelPicker`（消费默认值的一方）
留在 `features/assets/` 不动 —— 生产者与消费者分处两个领域是对的。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**当前无章程违反项。**

### 边界登记

| 事项 | 性质 | 处置 |
|------|------|------|
| 信息项可删除，持有方与账号只能停用 | 原则 III 一致性边界 | 三者的约束来源不同：信息项是纯配置；持有方被流转历史按 id 引用；账号被 `actor_id` 外键引用因而永远删不掉。给账号一个永远被拒绝的删除按钮比不给更糟。理由写进 FR-009 与 research.md D3，**不是漏改** |
| 删除判定做全表扫描 | 原则 IV 边界 | 「有没有人填过这个字段」无法靠索引回答 —— `attrs` 是 JSON 列，key 是运行时可配的。删除是低频操作，且这一次扫描换来的是「删除永远不会丢数据」。若日后成为问题，正确的解法是给删除加异步预检，而不是放宽判定 |
| 迁移 003 不在事务内执行 | 数据安全边界 | 与 002 同因：表重建需要 `PRAGMA foreign_keys=off`，该 pragma 在事务内是空操作。风险由完整的 Down 迁移与 up/down 往返用例覆盖 |
| 用户提出的章程条款本轮不加 | 范围边界 | 澄清时确认先不加。代价已在 `docs/design-baseline-v3.md` 决策 52 中写明：同类漂移会重演且同样全绿。这是一个**知情的**推迟，不是遗漏 |
