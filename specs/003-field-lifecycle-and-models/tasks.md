---

description: "Task list for 003-field-lifecycle-and-models"
---

# Tasks: 信息项生命周期与型号归属

**Input**: Design documents from `/specs/003-field-lifecycle-and-models/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 测试为**强制**要求（章程原则 II，NON-NEGOTIABLE）。每个特性必须包含：
核心管线逻辑的单元测试、每个 HTTP 端点的集成测试（真实 SQLite 临时库）、
以及**触及 UI 时的 DOM 测试**（Vitest + React Testing Library）。不得省略。

**Organization**: 任务按用户故事分组，使每个故事都能独立实现、独立测试、独立交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[Story]**: 所属用户故事（US1–US5）
- 描述中必须含确切文件路径

## Path Conventions

沿用 001 的结构。**本特性不新增后端包**；前端新增一个组件文件。

## 关于 Phase 1 为何阻塞 US1 与 US3

`field_definitions.archived_at` 与 `product_models.category_id` 是两个列。
删列这个动作没有渐进路径 —— 引用它们的代码必须在同一步里改完。
US2（解绑）与 US5（界面一致）不依赖 Phase 1，可以先做。

---

## Phase 1: Foundational（阻塞 US1 与 US3）

**Purpose**: 迁移与领域模型

- [X] T001 Write `migrations/003_field_lifecycle.sql` with `-- +goose NO TRANSACTION` — rebuild `field_definitions` without `archived_at`, rebuild `product_models` without `category_id` and with `vendor NOT NULL DEFAULT ''` plus `UNIQUE(vendor, name)` (data-model.md §2)
- [X] T002 Create `product_model_categories` and migrate every model's existing `category_id` into it, plus `ix_pmc_category`, in `migrations/003_field_lifecycle.sql`
- [X] T003 Write the Down migration restoring the post-002 shape in `migrations/003_field_lifecycle.sql` — it is lossy by nature (many-to-many collapses to one), so it restores the schema, not the associations
- [X] T004 Extend `internal/store/migrate_test.go` to assert the post-003 column set and that a `vendor IS NULL` row migrates to `''`
- [X] T005 Add a test in `internal/store/migrate_test.go` that `UNIQUE(vendor, name)` actually bites — two rows with the same empty vendor and name must be rejected (a nullable vendor would have let both in)
- [X] T006 Drop `FieldDefinition.ArchivedAt`, replace `ProductModel.CategoryID` with `CategoryIDs []string` in `internal/model/model.go`

---

## Phase 2: User Story 1 — 删掉建错的信息项 (Priority: P1) 🎯 MVP

**Goal**: 没有数据的信息项能被删干净；有数据、有引用的删不掉且说明白为什么

**Independent Test**: 建一个信息项直接删；再建一个绑定后录入资产填值，确认删不掉

### Tests for User Story 1 (REQUIRED - 章程原则 II) ⚠️

- [X] T007 [P] [US1] Unit test that an unbound field deletes, and that a bound field with no asset values also deletes along with its binding, in `internal/schema/delete_test.go`
- [X] T008 [P] [US1] Unit test that a field with a non-empty value on any asset is refused, and that the error carries the blocking assets and a total, in `internal/schema/delete_test.go`
- [X] T009 [P] [US1] Unit test that a value of `""` or whitespace does **not** block deletion — a field opened then cleared must not be undeletable, in `internal/schema/delete_test.go`
- [X] T010 [P] [US1] Unit test that an expression-key reference and a display-key nomination each refuse the delete, in `internal/schema/delete_test.go`
- [X] T011 [P] [US1] Integration test that `DELETE /api/fields/:id` returns 204, and 409 with `blockers` / `referrers` in the three refusal cases, in `internal/httpapi/categories_test.go`

### Implementation for User Story 1

- [X] T012 [US1] Implement `AssetsUsing(ctx, key)` in `internal/schema/refcheck.go` — the full-table `json_extract` scan, `trim`-then-compare, returning the first few plus a total (research.md D1)
- [X] T013 [US1] Replace `ArchiveField` with `DeleteField` in `internal/schema/refcheck.go` — reference check, display-key check, then the asset-value check, cheapest first
- [X] T014 [US1] Delete the binding rows, `json_remove` the key from every asset, then delete the definition, all in one transaction, in `internal/schema/field_store.go`
- [X] T015 [US1] Drop `archived_at` from `fieldCols`, `scanField` and `UpdateFieldInput` in `internal/schema/field_store.go`
- [X] T016 [US1] Remove the `archived_at IS NULL` filters from `loadLibrary` and `loadChain` in `internal/schema/binding.go`
- [X] T017 [US1] Keep `ActiveFields()` as an identity function with a comment saying why it survives — it is the mount point for any future "not in effect" state (research.md D2)
- [X] T018 [US1] Add `DELETE /fields/:id` in `internal/httpapi/server.go` and implement `deleteField` in `internal/httpapi/handlers_metadata.go`, attaching `referrers` or `blockers`+`total` per refusal kind
- [X] T019 [US1] Remove the `archive` branch from `patchField` in `internal/httpapi/handlers_metadata.go`
- [X] T020 [US1] Add the delete-related copy to `internal/httpapi/messages.go`

### Frontend for User Story 1

- [X] T021 [US1] Change the archive button to a delete button with an `AlertDialog` confirmation in `web/src/features/fields/FieldEditor.tsx`
- [X] T022 [US1] Render both `referrers` and `blockers` in the refusal message in `web/src/features/fields/FieldEditor.tsx`
- [X] T023 [P] [US1] Drop `archived_at` from `FieldDefinitionRow` in `web/src/lib/metaTypes.ts`
- [X] T024 [P] [US1] Update the archive-to-delete copy in `web/src/i18n/zh.ts`
- [X] T025 [US1] Update `web/tests/fieldEditor.test.tsx` — delete instead of archive, and the assertion must stop expecting an error message the backend can no longer produce

**Checkpoint**: 建错的信息项可以删掉了。**还不能**下线一个用过的字段 —— 那是 US2

---

## Phase 3: User Story 2 — 下线一个仍在使用的字段 (Priority: P2)

**Goal**: 解绑有端点、有界面、有二次确认；存量值保留为孤儿键

**Independent Test**: 在有资产的类别上解绑一个字段，确认表单不再要求它、详情页仍能读到旧值

### Tests for User Story 2 (REQUIRED - 章程原则 II) ⚠️

- [X] T026 [P] [US2] Integration test that `DELETE /api/categories/:id/bindings/:field_id` returns 204 and that the field leaves the category schema, in `internal/httpapi/categories_test.go`
- [X] T027 [P] [US2] Integration test that the existing unbind guards still fire through the new endpoint (expression key, display key), in `internal/httpapi/categories_test.go`
- [X] T028 [P] [US2] Integration test that a value stored before the unbind is still readable afterwards as an archived attribute, in `internal/httpapi/categories_test.go`
- [X] T029 [P] [US2] DOM test that the category page offers an unbind control per bound field and confirms before acting, in `web/tests/categories.test.tsx`

### Implementation for User Story 2

- [X] T030 [US2] Register `DELETE /categories/:id/bindings/:field_id` in `internal/httpapi/server.go`
- [X] T031 [US2] Implement `unbindField` in `internal/httpapi/handlers_metadata.go` — call the guard that has existed since 002 and never had a caller, and audit the change
- [X] T032 [US2] Add the unbind button with an `AlertDialog` to the bound-field list in `web/src/routes/Categories.tsx`, explaining that stored values are kept read-only
- [X] T033 [P] [US2] Add the unbind copy to `web/src/i18n/zh.ts`

**Checkpoint**: 「不再需要某个字段」在界面上有一条走得通的路 —— 移除停用不再是净损失

---

## Phase 4: User Story 3 — 一个型号服务多个类别 (Priority: P3)

**Goal**: 型号与类别多对多；重名按厂商 + 名称判定

**Independent Test**: 建一个型号关联两个类别，两边录入都能选到

### Tests for User Story 3 (REQUIRED - 章程原则 II) ⚠️

- [X] T034 [P] [US3] Unit test that a model associated with two categories is a candidate under both, in `internal/schema/model_store_test.go`
- [X] T035 [P] [US3] Unit test that a model on an ancestor is a candidate for a descendant, but not the other way round, in `internal/schema/model_store_test.go`
- [X] T036 [P] [US3] Unit test that `(vendor, name)` collides while two vendors may share a name, in `internal/schema/model_store_test.go`
- [X] T037 [P] [US3] Integration test that `POST /api/models` accepts `category_ids` and returns them, in `internal/httpapi/categories_test.go`

### Implementation for User Story 3

- [X] T038 [US3] Rewrite `internal/schema/model_store.go` over the join table — create with `category_ids`, load them back on read, and normalise a missing vendor to `""`
- [X] T039 [US3] Implement `CandidateModels(ctx, categoryPath)` in `internal/schema/model_store.go` using the ancestor `LIKE` predicate (data-model.md §4)
- [X] T040 [US3] Change `ModelByName` to resolve globally and report ambiguity in `internal/schema/model_store.go`
- [X] T041 [US3] Update the importer's model resolution to surface an ambiguity as a row error in `internal/importer/resolve.go`
- [X] T042 [US3] Accept and return `category_ids` in `internal/httpapi/handlers_metadata.go`

### Frontend for User Story 3

- [X] T043 [US3] Replace the single category select with a multi-select in `web/src/routes/Models.tsx`
- [X] T044 [P] [US3] Change `ProductModelRow.category_id` to `category_ids` in `web/src/lib/metaTypes.ts`
- [X] T045 [US3] Filter candidates by the ancestor chain over `category_ids` in `web/src/features/assets/ModelPicker.tsx`
- [X] T046 [P] [US3] Update the model fixtures in `web/tests/modelPicker.test.tsx` and add a case for the ancestor direction

---

## Phase 5: User Story 4 — 型号真正可用 (Priority: P4)

**Goal**: 默认值有编辑入口；演示数据里有型号

### Tests for User Story 4 (REQUIRED - 章程原则 II) ⚠️

- [X] T047 [P] [US4] DOM test that default values can be added, edited and removed row by row in `web/tests/attrDefaults.test.tsx`
- [X] T048 [P] [US4] DOM test that a key absent from the current category is silently skipped when applying defaults, in `web/tests/modelPicker.test.tsx`

### Implementation for User Story 4

- [X] T049 [US4] Implement `web/src/features/metadata/AttrDefaultsEditor.tsx` — a key/value row list built from `Input` and `Button`, no new component library
- [X] T050 [US4] Mount the editor on `web/src/routes/Models.tsx` and send `attr_defaults` on create
- [X] T051 [P] [US4] Add the default-value copy to `web/src/i18n/zh.ts`
- [X] T052 [US4] Create a model with defaults, associated with two categories, in `cmd/nexus/seed.go`

---

## Phase 6: User Story 5 — 界面说的和系统做的一致 (Priority: P5)

**Goal**: 八处不一致清零

### Tests for User Story 5 (REQUIRED - 章程原则 II) ⚠️

- [X] T053 [P] [US5] DOM test that a refused holder archive lists the blocking devices rather than a single sentence, in `web/tests/metadata.test.tsx`
- [X] T054 [P] [US5] Add a copy-hygiene test asserting no user-facing string mentions the category deciding how numbers are generated, in `web/tests/i18n.test.ts`

### Implementation for User Story 5

- [X] T055 [US5] Parse `blockers` and `total` in `ApiError` in `web/src/lib/api.ts` — the server has been sending them since 001 and the client threw them away
- [X] T056 [US5] Render the blocking devices on `web/src/routes/Holders.tsx`, reusing the shape of the field referrer list
- [X] T057 [P] [US5] Rewrite the two hints that still say the category decides how numbers are generated, in `web/src/i18n/zh.ts`
- [X] T058 [P] [US5] Remove the copy entries no code references (`archiveBlocked`, `deleted`, `noRows`, `recentEmpty`) from `web/src/i18n/zh.ts`; `blocked` and `blockedBy` come back into use via T056
- [X] T059 [P] [US5] Strip `sn_template`, `sn_template_from` and `archived_at` from the fixtures in the six affected files under `web/tests/`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T060 Update `specs/001-asset-ledger-demo/contracts/openapi.yaml` in place — it remains the full API surface. Reconciling it against the router turned up two endpoints missing since 001 (`POST /categories/:id/bindings`, `GET /fields/:id/referrers`); all 38 routes are now described
- [X] T060a Carry orphan values through the save pipeline in `internal/asset/pipeline.go`. **Found while implementing US2**: `ValidateAttrs` rebuilds attrs from the effective field set, so the first ordinary edit after an unbind silently dropped the very values unbinding exists to preserve. Regression test in `internal/asset/orphan_test.go`
- [X] T060c Map the model duplicate-name constraint onto a 409 with a usable message in `internal/schema/model_store.go` and `internal/httpapi/errors.go`. **Found in the live pass**: a second product with the same name under one vendor came back 500 — the unique index fired and nobody translated it
- [X] T060b Use the `yes`/`no` copy for boolean columns in `web/src/routes/Assets.tsx` — the strings existed for this and the list was rendering `true`/`false`
- [X] T061 [P] Add the v3 pointer to `CLAUDE.md` and note that field archiving is gone
- [X] T062 [P] Add a superseded note to the 001 requirement that fields can only be archived
- [X] T063 Verify core-pipeline coverage stays over 80%
- [X] T064 Run all seven merge gates plus a live end-to-end pass (seed → delete a field → unbind a field → multi-category model → refused holder archive → verify)

---

## Dependencies

```
Phase 1 (Foundational) ──┬─→ Phase 2 (US1) ─→ Phase 3 (US2)
                         └─→ Phase 4 (US3) ─→ Phase 5 (US4)
Phase 6 (US5) ── 独立，随时可做
Phase 7 (Polish) ── 最后
```

### 故事之间的真实依赖

- **US1 → US2**：US1 移除停用，US2 补上替代路径。**顺序不能反** ——
  先做 US2 只是多一个功能，先做 US1 则会有一段时间没有任何下线手段
- **US3 → US4**：默认值编辑器要挂在型号表单上，而 US3 正在重写那个表单
- **US5 完全独立**：它修的是既有不一致，与本轮的两个模型改动不相交

---

## Parallel Execution Examples

```
Phase 1：T001 → T002 → T003 顺序（同一文件）；T004/T005 可并行；T006 独立
Phase 2：T007 ~ T011 五条测试全部可并行；T012 → T013 顺序；T023/T024 可并行
Phase 4：T034 ~ T037 可并行；T038 → T039 → T040 顺序（同一文件）
Phase 6：T055 → T056 顺序；T057/T058/T059 三者可并行
```

**跨故事**：Phase 1 之后，US1+US2 与 US3+US4 是两条互不重叠的线索，可交给两个人。
US5 是第三条，只碰前端与文案。

---

## Implementation Strategy

### MVP 范围

**Phase 1 + Phase 2 + Phase 3**，共 33 个任务。

US1 与 US3 合起来才构成一个完整的生命周期 —— 删得掉建错的，下得了用过的。
只交付 US1 会让系统在一段时间内没有任何字段下线手段，比现状更糟。

### 增量顺序

1. **US1 + US2** → 信息项的生命周期完整（必须成对交付）
2. **US3** → 型号能对上多个类别
3. **US4** → 型号真的有内容可给
4. **US5** → 界面与 API 说同一件事

### 每个阶段结束时

跑一遍 quickstart.md 的七条合并门禁。本轮尤其要盯：

- **`vendor NOT NULL`**：唯一约束在 NULL 上静默失效，T005 就是为它写的
- **`archived_attrs` 别跟着删**：它由解绑产生，不是由停用产生。删掉它会让「解绑后仍能
  查看旧值」当场失效，而且没有任何现有测试会失败
