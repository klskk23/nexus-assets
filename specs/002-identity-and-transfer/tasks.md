---

description: "Task list for 002-identity-and-transfer"
---

# Tasks: 编号模型重构与流转补全

**Input**: Design documents from `/specs/002-identity-and-transfer/`

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

沿用 001 的结构：后端 `cmd/nexus/`、`internal/`、`migrations/`；前端 `web/src/`、`web/tests/`。
**本特性不新增包**，理由见 plan.md「Structure Decision」。

## 没有 Setup 阶段

工具链、依赖、门禁脚本全部由 001 建立且无需改动 —— 本特性的新增依赖为零。
Phase 1 直接从迁移与领域模型开始。

## 关于 Phase 1 为何阻塞全部故事

`assets.sn` 是一个列，`Asset` 是一个结构体，两者被 14 个 Go 文件与 8 个前端文件引用。
在它们改完之前，任何一个故事的代码都编译不过。这不是设计上的耦合，是删列这个动作本身的
性质 —— 删一个被到处读的列，没有渐进路径。

---

## Phase 1: Foundational（阻塞所有用户故事）

**Purpose**: 迁移、领域模型、唯一值表的读写路径

**⚠️ CRITICAL**: 本阶段完成前，任何用户故事都无法开工

### 迁移

- [X] T001 Write `migrations/002_identity.sql` with `-- +goose NO TRANSACTION` — drop `asset_sn_history` and `ix_assets_mac`, rebuild `assets` without `sn`, swap `categories.sn_template` for `display_key`, create `asset_unique_values` (research.md D1, D2)
- [X] T002 Add the partial unique index `ux_uv_live ON asset_unique_values(field_key, value) WHERE archived_at IS NULL` plus `ix_uv_value` and `ix_uv_asset` in `migrations/002_identity.sql` (data-model.md §2)
- [X] T003 Write the Down migration restoring the exact 001 shape — `sn` column, `sn_template`, `asset_sn_history`, `ix_assets_mac` — in `migrations/002_identity.sql`
- [X] T004 Update `internal/store/migrate_test.go` to assert the post-002 table and column set, and that Down restores the 001 shape exactly
- [X] T005 Add `TestUniqueValueIndexIgnoresArchived` in `internal/store/migrate_test.go` — a second live row on the same key is rejected, archiving frees the slot, two archived copies coexist, and a dangling `asset_id` is refused

### 领域模型

- [X] T006 Drop `Asset.SN`, add derived `Asset.DisplayName`, swap `Category.SNTemplate` for `Category.DisplayKey` in `internal/model/model.go`
- [X] T007 Add `ShortID()` and `AssetDisplayName()` to `internal/model/model.go` — the fallback identifier and the resolution rule, in one place so backend, importer and verify cannot disagree (data-model.md §3)

### 唯一值的读写路径

- [X] T008 Replace `checkUnique` with `uniqueValues` + `probeUnique` in `internal/asset/persist.go` — extract the values that must not collide, then look for a live collision so the error can name the device holding it
- [X] T009 Implement `syncUniqueValues` in `internal/asset/persist.go` — archive rows whose value changed or whose key left, insert the new ones; the partial index is the backstop (data-model.md §5)
- [X] T010 Implement `describeAsset` in `internal/asset/persist.go` so a collision names the other device the way a person would refer to it, not by UUID
- [X] T011 Order the uniqueness probe static-keys-first in `internal/asset/persist.go` — a duplicate MAC collides on both `mac` and the number derived from it, and only `mac` is a field the user can edit (research.md D8)

---

## Phase 2: User Story 1 — 新类别不再被编号规则挡住 (Priority: P1) 🎯 MVP

**Goal**: 一个没有配置任何编号规则的类别可以正常录入、检索、删除资产

**Independent Test**: 空系统建一个类别、绑一个文本信息项，不做编号配置，录入一台设备并删除它

### Tests for User Story 1 (REQUIRED - 章程原则 II) ⚠️

- [X] T012 [P] [US1] Unit test that an asset in a category with no display key falls back to an eight-hex-digit short UUID in `internal/asset/pipeline_test.go` (`TestDisplayNameFallsBackToShortUUID`)
- [X] T013 [P] [US1] Unit test that delete requires the displayed identifier typed out, in `internal/asset/pipeline_test.go` (`TestDeleteRequiresMatchingDisplayName`)
- [X] T014 [P] [US1] Integration test that `DELETE /api/assets/:id?confirm=` refuses a mismatch and accepts the right value in `internal/httpapi/audit_test.go`

### Implementation for User Story 1

- [X] T015 [US1] Remove the serial-number stage from the save pipeline in `internal/asset/pipeline.go` — 10 steps become 9, and the mandatory `sn` FieldError disappears with it
- [X] T016 [US1] Allocate the asset id in `Prepare` rather than at write time in `internal/asset/pipeline.go`, so an expression key may read `{{ .id }}` (data-model.md §4)
- [X] T017 [US1] Carry the category's display key through `Prepared` and fill `out.DisplayName` in `internal/asset/pipeline.go`, so a create response is already named
- [X] T018 [US1] Resolve `DisplayName` on read in `internal/asset/query.go` — one `DisplayKeys()` map for a whole page, never a lookup per row (章程原则 IV)
- [X] T019 [US1] Change `Delete` to confirm against the display name in `internal/asset/query.go`, and cascade `asset_unique_values`
- [X] T020 [US1] Rename the delete confirmation parameter from `confirm_sn` to `confirm` in `internal/httpapi/handlers_assets.go`
- [X] T021 [US1] Drop `sn` from `assetCols` and `scanAsset` in `internal/asset/persist.go`
- [X] T022 [US1] Replace `Blocker.SN` with `Blocker.Name` and rewrite `listBlockersSQL` in `internal/holder/refcheck.go` — it selected and ordered by a column that no longer exists

### Frontend for User Story 1

- [X] T023 [P] [US1] Swap `Asset.sn` for `Asset.display_name` and `Category.sn_template` for `display_key` in `web/src/lib/types.ts`
- [X] T024 [P] [US1] Use `display_name` in the list's first column in `web/src/routes/Assets.tsx`
- [X] T025 [US1] Use `display_name` in the heading, the change banner and the delete confirmation in `web/src/routes/AssetDetail.tsx`
- [X] T026 [P] [US1] Update the fixtures and assertions in `web/tests/assets.test.tsx` and `web/tests/assetDetail.test.tsx`

**Checkpoint**: 此时系统已解除阻塞 —— 新类别可以直接用。**还没有**人类可读的编号，那是 US2

---

## Phase 3: User Story 2 — 编号是一个信息项 (Priority: P2)

**Goal**: 编号作为表达式键存在，类别选用其一作为显示编号；任一唯一字段都能扫码直达

**Independent Test**: 在 US1 的类别上补 MAC 与表达式键，设为显示编号，改一次 MAC 验证归档与检索

### Tests for User Story 2 (REQUIRED - 章程原则 II) ⚠️

- [X] T027 [P] [US2] Unit test that the display key must be a unique field, and that an unbound key is refused, in `internal/asset/pipeline_test.go` (`TestDisplayKeyMustBeUnique`)
- [X] T028 [P] [US2] Unit test that correcting a MAC regenerates the number and archives **both** old values in `internal/asset/pipeline_test.go`
- [X] T029 [P] [US2] Unit test that the display key is not inherited, but an inherited binding is still selectable, in `internal/schema/store_test.go` (`TestDisplayKeyIsNotInherited`)
- [X] T030 [P] [US2] Integration test that the recompute endpoint previews then applies, and that a conflict abandons the run entirely, in `internal/httpapi/categories_test.go`

### Implementation for User Story 2

- [X] T031 [US2] Swap `sn_template` for `display_key` throughout `internal/schema/category_store.go`, including `SNTemplates()` → `DisplayKeys()`
- [X] T032 [US2] Implement `validateDisplayKey` in `internal/schema/category_store.go` — bound, active and unique, with a message that says which to fix (data-model.md §6)
- [X] T033 [US2] Delete `ResolveSNTemplate` from `internal/schema/resolve.go` — nothing left to resolve
- [X] T034 [US2] Rewrite exact matching over `asset_unique_values` in `internal/asset/query.go` — live values, then archived, then the UUID; stop on ambiguity rather than pick one (research.md D4)
- [X] T035 [US2] Replace `SNHistory` with `ValueHistory` in `internal/asset/query.go`, returning key/value/archived_at rather than bare strings
- [X] T036 [US2] Widen the substring search to the unique-value table, model names and the UUID prefix in `internal/asset/query.go`
- [X] T037 [US2] Rewrite `RecomputeSN` as `Recompute` over every expression key in `internal/asset/recompute.go`, and batch the model lookups instead of one per row
- [X] T038 [US2] Give conflicts and samples a `key` in `internal/asset/recompute.go` — with more than one recomputed field, a report without it cannot be read
- [X] T039 [US2] Sort the conflict list in `internal/asset/recompute.go` so two identical dry runs read identically
- [X] T040 [US2] Rename the endpoint to `POST /categories/:id/recompute` in `internal/httpapi/server.go` and `handlers_metadata.go`
- [X] T041 [US2] Return `value_history` instead of `sn_history` from `GET /assets/:id` in `internal/httpapi/handlers_assets.go`
- [X] T042 [US2] Drop `sn_template` / `sn_template_from` from the category schema response, return the `category` object instead, in `internal/httpapi/handlers_metadata.go`
- [X] T043 [US2] Rebuild the seed data on the new model in `cmd/nexus/seed.go` — `sn` becomes a unique expression key bound after `mac`, then nominated as display key

### Frontend for User Story 2

- [X] T044 [US2] Replace `SnTemplateEditor` with `web/src/features/categories/DisplayKeyEditor.tsx` — a picker over the category's unique fields plus the recompute preview
- [X] T045 [US2] Offer only `is_unique` fields in the picker in `web/src/features/categories/DisplayKeyEditor.tsx`; the server refuses the rest anyway, and offering them invites the refusal
- [X] T046 [US2] Wire the new editor into `web/src/routes/Categories.tsx` and drop the `sn_template` input from the create form
- [X] T047 [US2] Group the field-type dropdown into static keys and expression keys in `web/src/routes/Fields.tsx` (FR-008 — 概念二分只落在 UI 上，数据模型不动)
- [X] T048 [P] [US2] Show the retired values on the detail page in `web/src/routes/AssetDetail.tsx`
- [X] T049 [P] [US2] Rename `row.sn` to `row.display` in `web/src/routes/Import.tsx` and `internal/importer/preview.go`
- [X] T050 [P] [US2] Use `display_name` for the first export column in `internal/importer/export.go`
- [X] T051 [US2] Replace `web/tests/snTemplate.test.tsx` with `web/tests/displayKey.test.tsx` — six cases covering the unique-only picker, save/recompute separation, preview, conflicts and the no-op report

**Checkpoint**: 编号能力回来了，且不再是特例。US1 与 US2 合起来构成本特性的 MVP

---

## Phase 4: User Story 3 — 配置错误在配置时就被拦住 (Priority: P3)

**Goal**: 三个方向的依赖门禁，让「该类别所有资产存不进去」这种状态无法被配置出来

**Independent Test**: 按错误顺序绑定表达式键，逐条确认拒绝理由指向要先修的那一项

### Tests for User Story 3 (REQUIRED - 章程原则 II) ⚠️

- [X] T052 [P] [US3] Unit test the dependency closure — transitive through expression keys, cycle reported rather than looped, static key closes to empty — in `internal/schema/deps_test.go`
- [X] T053 [P] [US3] Unit test the four bind-gate outcomes (unknown / unbound / optional / accepted) in `internal/schema/deps_test.go`
- [X] T054 [P] [US3] Unit test that an inherited input satisfies the gate in `internal/schema/deps_test.go`
- [X] T055 [P] [US3] Unit test that unbinding a field an expression reads, or that is a display key, is refused — and that removing the reader first frees it — in `internal/schema/deps_test.go`
- [X] T056 [P] [US3] Unit test that a template edit is re-checked against every bound category, that the rejected edit was not written, and that a label-only edit is unaffected, in `internal/schema/deps_test.go`
- [X] T057 [P] [US3] Integration test that binding a cyclic expression key is refused with the cycle path in `internal/httpapi/categories_test.go`
- [X] T058 [P] [US3] Integration test that archiving a field used as a display key is refused with the referrer listed in `internal/schema/refcheck_test.go`

### Implementation for User Story 3

- [X] T059 [US3] Implement `DependencyClosure` in `internal/schema/deps.go` — recursive, cycle-detecting, sorted for a stable message (data-model.md §6)
- [X] T060 [US3] Implement `loadLibrary` and `loadChain` in `internal/schema/binding.go` — the field library and the category's effective set, both inside the write transaction
- [X] T061 [US3] Implement `checkBindDeps` in `internal/schema/binding.go` and call it from `Bind` — classify the failures into unknown / unbound / not-required rather than reporting one flat message (FR-017)
- [X] T062 [US3] Implement `checkUnbindSafe` in `internal/schema/binding.go` and call it from `Unbind` — the mirror of the bind gate, over the ancestor chain and the whole subtree
- [X] T063 [US3] Extend `checkUnbindSafe` to refuse when a category nominates the field as its display key in `internal/schema/binding.go`
- [X] T064 [US3] Implement `recheckBoundCategories` in `internal/schema/field_store.go` and call it from `UpdateField` **after** the UPDATE, so the check reads the new template and a failure rolls back (quickstart.md 静默做错 §3)
- [X] T065 [US3] Add `categoriesUsingDisplayKey` to `internal/schema/refcheck.go` and fold it into `ArchiveField`'s referrer list
- [X] T066 [US3] Drop the `sn_template` branch from `ReferrersOf` and add the `display_key` referrer kind in `internal/schema/refcheck.go`
- [X] T067 [US3] Map `ErrDependenciesUnmet`, `ErrDisplayKeyInvalid` and `ErrFieldDependedOn` onto 422/409 in `internal/httpapi/errors.go`, passing their guidance through rather than flattening it

### Frontend for User Story 3

- [X] T068 [P] [US3] Show the template and dependency hints on the expression-key form in `web/src/routes/Fields.tsx` and `web/src/features/fields/FieldEditor.tsx`

**Checkpoint**: 配置错误的发现时机从「录入时」提前到「配置时」，错误对象从结果换成原因

---

## Phase 5: User Story 4 — 在详情页完成一次交接 (Priority: P4)

**Goal**: 详情页可完成全部五种流转操作，且与列表页共用同一交互

**Independent Test**: 在详情页完成一次签出与一次改状态，不离开该页面

### Tests for User Story 4 (REQUIRED - 章程原则 II) ⚠️

- [X] T069 [P] [US4] DOM test that the detail page hands a device over — the request body must match the list page's byte for byte — in `web/tests/assetDetail.test.tsx`
- [X] T070 [P] [US4] DOM test that the status can be changed without leaving the detail page in `web/tests/assetDetail.test.tsx`
- [X] T071 [P] [US4] Confirm the existing `web/tests/actionBar.test.tsx` cases still pass unchanged after the refactor — they exercise the full form, so passing proves both surfaces share one path

### Implementation for User Story 4

- [X] T072 [US4] Extract the transfer form into `web/src/features/transfers/TransferDialog.tsx` — one shared dialog, an optional preselected action, a single asset id is just a one-element batch (research.md D7)
- [X] T073 [US4] Reset the preselected action on reopen in `web/src/features/transfers/TransferDialog.tsx`, so a second button does not show the first one's choice
- [X] T074 [US4] Reduce `web/src/features/assets/ActionBar.tsx` to a selection bar whose buttons open the shared dialog with that action preselected
- [X] T075 [US4] Add the transfer button and mount the dialog on `web/src/routes/AssetDetail.tsx`, invalidating the asset and timeline queries on success
- [X] T076 [P] [US4] Add `zhTransfer.actions.title` and `.action` to `web/src/i18n/zh.ts`

**Checkpoint**: 同一操作只有一种交互形状（章程原则 III）

---

## Phase 6: User Story 5 — 型号与默认库存点 (Priority: P5)

**Goal**: 型号选择器存在并生效；默认库存点只能更换不能取消

**Independent Test**: 录入时选型号验证预填；换型号验证覆盖确认；分别尝试更换与取消默认库存点

### Tests for User Story 5 (REQUIRED - 章程原则 II) ⚠️

- [X] T077 [P] [US5] DOM test that the model picker offers the category chain and excludes a sibling branch and archived models, in `web/tests/modelPicker.test.tsx`
- [X] T078 [P] [US5] DOM test that creating fills only the blanks, and that changing the model of an existing asset asks first and honours both answers, in `web/tests/modelPicker.test.tsx`
- [X] T079 [P] [US5] Unit test that archiving the current default stock point is refused, and succeeds once the marker has moved, in `internal/holder/refcheck_test.go`
- [X] T080 [P] [US5] Integration test that clearing the default stock point is refused rather than ignored, and that moving it still works, in `internal/httpapi/categories_test.go`

### Implementation for User Story 5

- [X] T081 [US5] Implement `web/src/features/assets/ModelPicker.tsx` — candidates limited to the category chain, defaults applied to blanks on create
- [X] T082 [US5] Add the overwrite confirmation to `web/src/features/assets/ModelPicker.tsx` — list every key as `current → new default` and let the operator choose; nothing records whether a value was typed by hand, so it must not guess (FR-028)
- [X] T083 [P] [US5] Mount the picker on `web/src/routes/NewAsset.tsx` and clear the selection when the category changes
- [X] T084 [P] [US5] Mount the picker with `confirmOverwrite` on `web/src/routes/AssetDetail.tsx` and send the chosen `model_id` on save
- [X] T085 [US5] Add `ErrDefaultStockRequired` and refuse archiving the current default stock point in `internal/holder/store.go` — the old `Archive` cleared the marker on the way out, which was the back door around this very rule
- [X] T086 [US5] Return 422 with `MsgDefaultStockRequired` when `is_default_stock=false` in `internal/httpapi/handlers_metadata.go`, instead of silently doing nothing and returning 200
- [X] T087 [P] [US5] Surface the refusal on `web/src/routes/Holders.tsx` and give the current default a badge rather than a toggle that would only ever be refused
- [X] T088 [P] [US5] Add the model and default-stock strings to `web/src/i18n/zh.ts`
- [X] T089 [P] [US5] Add the two default-stock DOM cases to `web/tests/metadata.test.tsx`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T090 Add the two-way unique-value reconciliation to `cmd/nexus/verify.go` — stale live rows, and unique values with no live row (data-model.md §8, N3/N4)
- [X] T091 Refer to assets by display name rather than a dropped column throughout `cmd/nexus/verify.go`
- [X] T092 Implement `userText()` in `internal/httpapi/errors.go` to strip the English sentinel prefix from every message shown to a user (FR-031)
- [X] T093 Apply `userText()` to the two hand-rolled error paths in `internal/httpapi/handlers_metadata.go` (field archive, holder archive) — they bypass `FailErr` to attach referrers and blockers
- [X] T094 [P] Rewrite the three fully-English domain messages in Chinese in `internal/schema/category_store.go`, `internal/schema/binding.go` and `internal/auth/store.go`
- [X] T095 [P] Integration test that no error message carries its English sentinel, across three different sentinels, in `internal/httpapi/categories_test.go`
- [X] T096 [P] Update `specs/001-asset-ledger-demo/contracts/openapi.yaml` in place — it remains the full API surface
- [X] T097 [P] Add superseded banners to `docs/design-baseline.md` and the three 001 spec documents; rewrite the reading order and hard rules in `CLAUDE.md`
- [X] T098 [P] Rewrite the configuration steps in `specs/001-asset-ledger-demo/quickstart.md` for dependency-ordered binding
- [X] T099 Verify core-pipeline coverage is back over 80% after moving the gate tests into `internal/schema` — cross-package tests do not count toward a package's coverage
- [X] T100 Run all seven merge gates and a live end-to-end pass (seed → scan → correct a MAC → transfer → change status → delete → verify)

---

## Dependencies

### 阶段顺序

```
Phase 1 (Foundational)  ← 阻塞一切
    ↓
Phase 2 (US1)  ← 解除阻塞，MVP 的前一半
    ↓
Phase 3 (US2)  ← 依赖 US1 的 display_name 解析路径
    ↓
Phase 4 (US3)  ← 依赖 US2 的表达式键真正被当作编号使用
    ↓
Phase 5 (US4)  ─┐
Phase 6 (US5)  ─┴ 两者互不依赖，也不依赖 US2/US3
    ↓
Phase 7 (Polish)
```

### 故事之间的真实依赖

- **US1 → US2**：US2 要把某个字段设为显示编号，而显示编号的解析与回退是 US1 建的
- **US2 → US3**：门禁保护的是表达式键的可求值性。没有 US2，表达式键还只是个普通计算项，
  门禁虽然仍然正确，但拦下的是一个没人会犯的错
- **US4、US5 与前三个无依赖**：它们改的是流转入口、型号选择器与持有方，
  与编号模型不相交。**唯一的耦合是文件级的** —— `AssetDetail.tsx` 同时被 US1 与 US4 改到，
  `web/src/lib/types.ts` 与 `i18n/zh.ts` 被四个故事都改到。
  这是为什么本特性最终按两个提交而非五个提交落地：按故事切分会产出编译不过的中间状态

---

## Parallel Execution Examples

```
Phase 1：T001 → T002 → T003 顺序（同一文件）；T004/T005 可并行；
         T006 → T007 顺序；T008 → T009 → T010 → T011 顺序（同一文件）
Phase 2：T012, T013, T014 三条测试全部可并行；
         T015 → T016 → T017 是管线的顺序环节；T023, T024, T026 可并行
Phase 4：T052 ~ T058 七条测试全部可并行编写；
         T059 必须先于 T061 ~ T064（它们都调用依赖闭包）
Phase 5/6：两个阶段可完全并行 —— 除 i18n 与 types 外没有共同文件
```

**跨故事**：Phase 1 完成后，把 US1+US2+US3 交给一个人、US4+US5 交给另一个人是最有效的
切分 —— 前者是编号模型的一条完整线索，后者是三处独立的功能缺口。

---

## Implementation Strategy

### MVP 范围

**Phase 1 + Phase 2（US1）**，共 26 个任务。

交付后编号规则不再是录入的前置条件 —— 用户报告的第一个痛点解除。
此时设备用 UUID 短码指代，**还没有**人类可读的编号，那是 US2。

### 增量顺序

1. **US1** → 解除阻塞（这是唯一一个会让人完全无法工作的问题）
2. **US2** → 编号能力回来，且不再是特例
3. **US3** → 把 US2 引进来的新错误类别挡在配置阶段
4. **US4** → 详情页能做交接（用户报告的第二个痛点）
5. **US5** → 型号与默认库存点（第三、第四个痛点）

> 注意：US4 与 US5 的优先级排在后面是因为它们**不阻塞任何人** —— 列表页的流转一直是可用的，
> 只是绕。如果实际交付时仓库同事抱怨最多的是这个，把 US4 提到 US2 之后完全可行，
> 两者没有依赖关系。

### 每个阶段结束时

跑一遍 quickstart.md 的七条合并门禁。本特性尤其容易在两处掉链子：

- **覆盖率**：新门禁的测试若写在 `internal/asset` 里调用 `internal/schema`，
  schema 包的覆盖率不会涨。实现过程中因此从 81.8% 掉到 75.7%，把测试搬进包内才回到 81.2%
- **DOM 测试**：本特性新增三个 UI 组件，触及 UI 的 PR 必须有新增或更新的 DOM 测试，
  这是章程 NON-NEGOTIABLE 的门禁
