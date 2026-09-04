# Implementation Plan: 字段可以绑定型号

**Branch**: `015-model-bound-fields` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-model-bound-fields/spec.md`

## Summary

字段绑定新增「型号」这一种目标，与既有的「类别」目标**互斥**（决策 96）。值仍属于每台
资产，变的只是「这个字段该不该出现在这台资产上」的判断依据。

技术路径：新增 `model_fields` 绑定表（结构对齐既有的 `category_fields`），
把型号模式字段并进 `schema.EffectiveFields(categoryID)` 这**一个**函数的结果里——
录入表单、写入校验、导入模板、导出、显示列下拉五个消费方因此自动跟上（决策 101）。
唯一性借用既有的 `asset_unique_values.scope_id`：类别模式存类别 id（不变），
型号模式存 `f:<field_id>`，因为决策 99 的范围恰好就是「这个字段的绑定 footprint」。

## Technical Context

**Language/Version**: Go 1.26（后端）、TypeScript 5 + React 19（前端）

**Primary Dependencies**: Gin、goose、modernc.org/sqlite（CGO_ENABLED=0）；
Vite 6、react-router 7、TanStack Query 5、Tailwind v4、shadcn/ui

**Storage**: SQLite（WAL、`BEGIN IMMEDIATE`、写连接池 = 1）。
新增一张表 `model_fields`；复用 `asset_unique_values.scope_id` 不改其结构。

**Testing**: Go 标准 `testing`（真实临时 SQLite，不 mock 存储层）；
Vitest + React Testing Library + jsdom（DOM 测试，非快照）

**Target Platform**: Linux 单二进制（前端 embed），amd64 与 arm64

**Project Type**: Web（Go 后端 + React 前端，同一仓库、同一二进制）

**Performance Goals**: 沿用章程原则 IV——列表 p95 < 200ms、单条读写 p95 < 100ms、
初始 chunk < 500KB gzip。本轮不引入新的高频查询路径。

**Constraints**:
`EffectiveFields` 每次调用已经在做「一次性加载全部绑定」（`BindingsByCategory`，
数百条量级）。型号绑定同样一次性加载，**不得引入按行查询**（章程禁止 N+1）。

**Scale/Scope**: 万级资产、十人级并发。型号数量与类别同量级（数百）。
新增 3 张 UI 面（字段编辑器绑定区、资产列表型号筛选、资产弹窗属性卡）。

## Constitution Check

*GATE：Phase 0 前必须通过，Phase 1 设计后复检。*

依据 `.specify/memory/constitution.md` v1.1.0。

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：绑定模式互斥校验、有效字段集解析、唯一性范围计算全部落在 `internal/schema`，`internal/httpapi` 只做参数绑定与 error envelope 转换。**新增依赖**：无，一个都不加。**圈复杂度**：`bindTx` 已接近上限，型号绑定不塞进它——另起 `bindModelTx`，共用抽出的键冲突检查；`EffectiveFields` 的并入逻辑抽成独立函数 `resolveModelFields`，避免把现有函数推过 15。 |
| II | 测试标准 | **核心管线**：本轮触及「继承字段集解析」与「唯一性校验」两块（六块之二），必须覆盖失败分支：混绑被拒、`display_key` 拒绝型号字段、跨型号唯一性冲突、换型号归档、导入错配拒绝。**端点集成测试**：新增/改动的端点（型号绑定的建与解、`/categories/:id/schema` 的新字段、导入预览拒绝、导出列集）均在真实 SQLite 上测。**DOM 测试（触及 UI，强制）**：① 字段编辑器切绑定模式并勾型号；② 已绑类别时型号绑定入口被拒/禁用；③ 资产列表型号筛选进地址栏；④ 显示列下拉中型号字段未选型号时禁用、选中匹配型号后可勾；⑤ 清空型号筛选后该列自动收回；⑥ 资产弹窗顶部属性卡展示字段值且不含六个内建字段。 |
| III | 用户体验一致性 | **组件全部来自 shadcn/ui，无自定义组件**：绑定模式切换用 `ToggleGroup`（2 个选项，符合 shadcn 规则的「2–7 选项用 ToggleGroup」）；型号多选复用字段编辑器现有的 `Checkbox` 列表形态；型号筛选用 `Select`（禁止原生 `<select>`）；显示列下拉沿用既有 `DropdownMenuCheckboxItem`，不可选项**禁用而非隐藏**（既有约定）并带 `title` 说明；弹窗属性卡用 `Card` + `CardHeader/CardTitle/CardContent`，字段值用 `<dl>`，空值走 `t.common.none`。**三态**：属性卡与筛选沿用页面既有的 `StateBoundary`。**破坏性操作**：本轮不新增破坏性操作（换型号导致的归档不阻断，不需二次确认）。 |
| IV | 性能要求 | **无新增高频查询路径**：型号绑定与 `product_model_categories` 一次性全量加载（数百行），在内存里做交集，与既有 `BindingsByCategory` 同一模式，**不产生 N+1**。**索引**：`model_fields` 主键 `(model_id, field_id)` 覆盖「某型号有哪些字段」；新增 `ix_model_fields_field` 覆盖反向的「某字段绑了哪些型号」（字段列表页与解绑校验要用）。**分页**：不涉及新列表接口。**前端 bundle**：无新依赖，属性卡与筛选器都是既有组件的组合，影响可忽略。 |
| V | 语言规范 | **文档中文**（spec/plan/research/data-model/quickstart 全中文）、**代码英文**（表名 `model_fields`、字段 key、`error.code` 如 `field_binding_mode_conflict`）。**新增用户可见文案清单**（两种语言都要有，`zh.ts` 与 `en.ts`、`catalog.go` 同步）：绑定模式两个选项名、「绑定到型号」区标题与说明、混绑拒绝提示、`display_key` 不接受型号字段的提示、导入错配行的逐行提示、型号筛选器的「全部型号」、显示列中禁用项的 `title` 说明、弹窗属性卡标题、属性卡无字段时的空态文案。 |

**技术栈约束**：全部符合，无偏离。后端 Go + Gin + SQLite（`BEGIN IMMEDIATE`/WAL/写池 1）
+ goose；前端 Vite + React + TS + react-router + Tailwind + shadcn/ui + TanStack Query。

**Complexity Tracking**：无违反项，本节留空。

## Project Structure

### Documentation (this feature)

```text
specs/015-model-bound-fields/
├── spec.md              # 已完成（决策 96–104）
├── plan.md              # 本文件
├── research.md          # Phase 0：实现层面的未决项
├── data-model.md        # Phase 1：表结构与实体关系
├── quickstart.md        # Phase 1：端到端走一遍
├── contracts/
│   └── model-bindings.md  # Phase 1：接口变更清单
├── checklists/
│   └── requirements.md  # 已完成
└── tasks.md             # Phase 2（由 /speckit-tasks 产出，本命令不建）
```

### Source Code (repository root)

```text
migrations/
└── 017_model_fields.sql          # 新增绑定表 + 反向索引

internal/
├── schema/
│   ├── binding.go                # bindModelTx、互斥校验、键冲突检查抽取
│   ├── resolve.go                # 型号模式字段并入有效字段集
│   ├── model_binding.go          # 新增：型号绑定的读写
│   └── field_store.go            # 字段列表带上绑定模式与型号
├── asset/
│   ├── query.go                  # 有效字段集口径随之（无需改逻辑，只随 schema）
│   └── save.go                   # 换型号时的 archived_attrs 归档
├── importer/
│   ├── resolve.go                # 导入行的错配拒绝
│   └── template.go / export.go   # 列集随 EffectiveFields，预期零改动
└── httpapi/
    ├── handlers_metadata.go      # 绑定端点、schema 响应带型号信息
    └── handlers_fields.go 等     # error envelope

web/src/
├── features/fields/FieldEditor.tsx   # 绑定模式切换与型号多选
├── routes/Assets.tsx                 # 型号筛选、显示列解锁
├── features/assets/useColumns.ts     # 求交口径（预期零改动，确认即可）
└── routes/AssetDetail.tsx            # 顶部只读属性卡

web/tests/
├── fieldEditor.test.tsx     # 绑定模式 DOM 测试
├── assets.test.tsx          # 型号筛选与显示列 DOM 测试
└── assetDetail.test.tsx     # 属性卡 DOM 测试
```

**Structure Decision**：沿用仓库既有布局（Go 后端 `internal/*` 分层 + 前端 `web/src`），
不新建顶层目录。新增文件只有两个：迁移 `017_model_fields.sql` 与
`internal/schema/model_binding.go`；其余都是在既有文件里扩展。
这是决策 101「改动集中在一处」的直接结果。
