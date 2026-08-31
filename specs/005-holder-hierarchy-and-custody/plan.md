# Implementation Plan: 持有方层级与保管责任

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-holder-hierarchy-and-custody/spec.md`

## Summary

五件事，一个共同的成因：持有方那一侧的模型比人们描述保管关系的方式更薄。

部门不是凭空存在的，它属于某个公司；仓库通常也在某个组织下面；持有方需要记
「B 座三层，A01–A24 号货架」这种只有它自己知道的事；把设备交给一个组织之后
仍然得有一个人被问到；而「库存必须放在位置里」被当成规则强制执行，
它其实只是一条策略 —— 库存交给部门保管是完全正当的。

其中一件是修 bug 而非加功能：持有方类型的拒绝以前靠在错误文本里找「位置」两个字来识别，
然后报到 `to_status` 字段上。操作者动的是持有方，收到的是一句关于状态的话。

## Technical Context

**Language/Version**: 同 004 —— Go 1.26；TypeScript 5.x + React 19

**Primary Dependencies**: **无新增依赖**

**Storage**: SQLite。新增迁移 `migrations/005_holder_hierarchy.sql`：
`holder_entities` 加 `note`、加 `ix_holder_parent`，并把 `statuses.in_stock`
的 `requires_location` 置 0。**无表重建**，Down 完整可逆

**Testing**: 同 001–004。新增用例覆盖层级规则的四条、成环拒绝、备注往返、
在库交给部门、约束重开后的拒绝字段归属、实体签出带负责人、以及三处新 UI 的 DOM 测试

**Target Platform / Project Type / Performance Goals**: 同 001

**Constraints**: 迁移不回填 `parent_id`（research.md D6）；
层级规则前后端各存一份表，服务端仍然是唯一把关方

**Scale/Scope**: 5 个用户故事、17 条功能需求、1 次迁移、**无新增端点**。
后端约 8 个文件、前端约 6 个文件

## Constitution Check

依据 `.specify/memory/constitution.md` v1.1.0。**必须逐条填写符合情况，不得以「通过」一词概括。**

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：层级规则、成环检查、备注全部落在 `internal/holder`；`internal/httpapi` 只做绑定与错误映射。**圈复杂度**：`checkParent` 查一张表而不是走 if 链，加第四种持有方是一行数据。**新增依赖**：零 |
| II | 测试标准 | **核心管线**：层级四条规则、成环、备注往返在 `internal/holder` 内测试。**端点集成测试**：新增 `internal/httpapi/holders_test.go` 五条，含「在库交给部门」与「拒绝挂在 to_holder_id 而非 to_status」。**DOM 测试**：`tests/holderHierarchy.test.tsx` 五条、`tests/transferDialog.test.tsx` 四条、`tests/assets.test.tsx` 新增两条持有方筛选、`tests/statuses.test.tsx` 新增一条开关。**覆盖率**：核心五包维持 ≥ 80% |
| III | 用户体验一致性 | 全部组件取自 shadcn/ui，**自定义组件仍为 0**。上级与负责人用 `Select`，备注用 `Input`，表单布局仍是 `Field`；不可能合法的类型用 `SelectItem` 的 `disabled` 加一句 `FieldDescription`，而不是从列表里抹掉 —— 与信息项、状态的同类处置一致 |
| IV | 性能要求 | 新增 `ix_holder_parent`。成环检查沿父链上行，持有方是几十行的量级，且只在移动时发生。资产页新增一次 `/holders` 查询，与流转对话框共用 react-query 键，全页一次 |
| V | 语言规范 | 层级拒绝的中文文案在 `internal/holder/store.go` 的 `typeLabels` 一处；前端文案在 `zh.ts`。本轮修掉一处新违反：上级列表的连接词「或」最初写在组件里，已移进 `zhMeta.holders.parentRequired` |

**Gate 结论（Phase 0 前）**：五项原则全部通过。

**Gate 结论（Phase 1 设计后）**：通过。一条与 004 相抵触的决定
（内置状态的 `requires_location` 改为可编辑）登记在下方，附核对过程。

## Project Structure

```text
migrations/
└── 005_holder_hierarchy.sql   # note 列、parent 索引、in_stock 的开关置 0

internal/
├── model/model.go             # HolderEntity 加 Note
├── holder/store.go            # allowedParents、checkParent、descendsFrom、Update
├── schema/status_store.go     # requires_location 对内置解锁
├── transfer/transfer.go       # ErrHolderKind 哨兵
└── httpapi/
    ├── handlers_metadata.go   # holder 的 note / parent_id 出入参
    ├── handlers_transfers.go  # 拒绝改挂 to_holder_id
    └── errors.go              # 两个 parent 哨兵 → 422

web/src/
├── lib/types.ts               # note、ALLOWED_PARENTS、PARENT_REQUIRED
├── routes/Holders.tsx         # 上级、备注、类型禁用
├── routes/Assets.tsx          # 持有方筛选
├── routes/Statuses.tsx        # 位置约束开关
├── features/transfers/TransferDialog.tsx  # 负责人选择
└── i18n/zh.ts
```

**Structure Decision**: 不新增文件。层级规则本可以拆一个 `internal/holder/hierarchy.go`，
但它只有三个函数和两张表，和 `store.go` 里的其他约束（默认库存点、停用拦截）是同一类东西，
分出去只会让读者在两个文件间来回。

## Complexity Tracking

**当前无章程违反项。**

### 边界登记

| 事项 | 性质 | 处置 |
|------|------|------|
| 内置状态的 `requires_location` 改为可编辑，与 004 FR-012 相抵触 | 决策修订 | 004 锁死三个开关的理由是「系统其他部分写死了它们的含义」。核对读取点：`requires_location` 只被这条约束自己读，另外两个分别被概览与转换矩阵读。前者的理由不成立，后两者成立。**只改前者**，并在状态管理页把它做成可见可操作的勾选框，使这次改动可逆且不隐蔽 |
| 层级规则在前后端各存一份 | 重复边界 | 服务端仍然是唯一把关方；前端那份只用于**不提供**非法选项。让人填完再拒绝也能工作，但那是把校验当成交互 |
| `isTransitionError` 仍有四个关键词是字符串匹配 | 遗留边界 | 本轮只把会误导的那一条换成哨兵。其余四条目前不会导致字段归属错误；全部换成哨兵是对的，但不属于这一轮的诉求 |
| 迁移不回填 `parent_id` | 数据边界 | 存量部门没有公司可指。造一个「默认公司」会立刻出现在每个下拉里，而且没人同意过它。见 research.md D6 |
| 持有方没有编辑对话框 | 范围边界 | `PATCH /holders/{id}` 已支持改名、改备注、移动，并有测试。界面本轮只在新建时提供 —— 用户要求的是「可以定义备注」。行内编辑不做，也不留半成品入口 |
