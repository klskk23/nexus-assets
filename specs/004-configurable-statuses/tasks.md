---

description: "Task list for 004-configurable-statuses"
---

# Tasks: 可配置的状态

**Input**: Design documents from `/specs/004-configurable-statuses/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 测试为**强制**要求（章程原则 II，NON-NEGOTIABLE）。每个特性必须包含：
核心管线逻辑的单元测试、每个 HTTP 端点的集成测试（真实 SQLite 临时库）、
以及**触及 UI 时的 DOM 测试**（Vitest + React Testing Library）。不得省略。

**Organization**: 任务按用户故事分组，使每个故事都能独立实现、独立测试、独立交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[Story]**: 所属用户故事（US1–US4）
- 描述中必须含确切文件路径

## Path Conventions

沿用 001 的结构。**本特性不新增后端包**；前端新增一个目录 `features/statuses/`。

## 关于 Phase 1 为何阻塞全部故事

`model.AllStatuses` 与 `model.AssetStatus.Valid()` 被七个文件引用。
把状态变成数据意味着这两个符号消失 —— 引用它们的代码必须在同一步里改完，
没有渐进路径。Phase 1 完成之前，仓库处于不可编译状态。

---

## Phase 1: Foundational（阻塞全部故事）

**Purpose**: 迁移、领域模型、状态集的读取路径

- [X] T001 Write `migrations/004_statuses.sql` — create `statuses` with the eight columns and `ix_statuses_sort`, seed the five built-ins with the colours from spec FR-010 (data-model.md §1). No table rebuild, so no `NO TRANSACTION`
- [X] T002 Seed the timestamps with `strftime('%Y-%m-%dT%H:%M:%SZ','now')`, not `datetime('now')` — `store.ParseTime` only accepts RFC3339, and the difference fails every test that reads a row
- [X] T003 Write the Down migration in `migrations/004_statuses.sql` — two DROPs, fully reversible
- [X] T004 Extend `internal/store/migrate_test.go` to assert the table exists, the five built-ins are seeded, their flags reproduce the behaviour they replace, and Down restores the pre-004 shape
- [X] T005 Replace `AllStatuses`/`Valid()` with `BuiltinStatuses`/`Builtin()` and add the `Status` struct in `internal/model/model.go`
- [X] T006 Rewrite `internal/model/status.go` around `StatusSet` — `CanTransition`, `ValidateTransition`, `RequiresLocationHolder`, `CountsAsAvailable`, `Label`, keeping `legalTransitions` for built-in↔built-in (research.md D1)
- [X] T007 [P] Add `internal/store/statuses.go` — `Queryer`, `StatusColumns`, `ScanStatus`, `LoadStatuses`, `LoadStatusSet`, usable from both `*sql.DB` and `*sql.Tx` (data-model.md §4)
- [X] T008 Update `internal/model/status_test.go` to assert against a configured set, and add `TestCustomStatusDoesNotLoosenBuiltinRules` — the用例 that guards decision 55

---

## Phase 2: User Story 1 — 一眼分辨状态 (Priority: P1) 🎯 MVP

**Goal**: 状态徽章带上自己的颜色，深浅两套主题下都可读。

**Independent Test**: 打开资产列表，三种状态徽章颜色互不相同；切主题后仍然如此。

- [X] T009 [P] [US1] Add the eight-slot palette to `web/src/index.css` — three vars per slot, one block for light and one for `.dark`
- [X] T010 [US1] Add `.status-chip` **outside every `@layer`** in `web/src/index.css`, with a comment explaining why (research.md D4)
- [X] T011 [P] [US1] Widen `AssetStatus` to `string` and add `Status`, `StatusUsage`, `PALETTE` in `web/src/lib/types.ts`
- [X] T012 [US1] Add `web/src/features/statuses/useStatuses.ts` — the shared query plus `label`/`color`/`get`, both falling back to the raw key
- [X] T013 [US1] Add `web/src/features/statuses/StatusBadge.tsx` composing `Badge` with the palette class
- [X] T014 [P] [US1] Replace the grey `Badge variant="secondary"` with `StatusBadge` in `web/src/routes/Assets.tsx` and `web/src/routes/AssetDetail.tsx`
- [X] T015 [P] [US1] Render the overview cards with `StatusBadge` in `web/src/routes/Overview.tsx`
- [X] T016 [P] [US1] Resolve labels through `useStatuses` in `web/src/features/transfers/Timeline.tsx`
- [X] T017 [US1] Add `tests/fixtures/statuses.ts` and serve `/statuses` from the six test files that mock the API — it lives under `tests/`, not `src/test/`, so the i18n guard does not read its Chinese labels as stray copy

**Checkpoint**: 列表、详情、概览、时间线四处的状态呈现一致且有颜色。

---

## Phase 3: User Story 2 — 加一个业务需要的状态 (Priority: P2)

**Goal**: 管理员能自己建状态并立刻使用。

**Independent Test**: 建一个状态，把设备转进去，确认筛选、概览、时间线都认得它。

- [X] T018 [US2] Add `internal/schema/status_store.go` — `ListStatuses`, `StatusSet`, `GetStatus`, `CreateStatus`, `UpdateStatus`, reusing the scanner from `internal/store`
- [X] T019 [US2] Validate the key against `^[a-z][a-z0-9_]{0,31}$` and the colour against `PaletteColors`, both wrapped in `ErrStatusInvalid`
- [X] T020 [US2] Map `ErrStatusInvalid` to 422 in `internal/httpapi/errors.go`, and the duplicate key to `ErrKeyConflict`/409 — the default branch would report both as 500 (contracts/README.md)
- [X] T021 [US2] Add `internal/httpapi/handlers_statuses.go` with list/create/patch, and register the routes in `internal/httpapi/server.go`
- [X] T022 [P] [US2] Add `TargetStatus` to `internal/audit/audit.go` and record create/update/delete
- [X] T023 [US2] Read the target status from the configured set in `internal/httpapi/handlers_transfers.go` instead of `st.Valid()`
- [X] T024 [US2] Load the set from the transaction in `internal/transfer/transfer.go` and `internal/transfer/edit.go`; thread it through `applyOne`, `editOne`, `checkHolderForStatus`
- [X] T025 [US2] Load the set from the transaction in `internal/asset/pipeline.go` for the transition check
- [X] T026 [US2] Enumerate the configured statuses in `internal/asset/overview.go`, appending any status assets still hold that configuration no longer knows — otherwise the cards stop summing to `total`
- [X] T027 [P] [US2] Read labels from the database in `internal/importer/export.go`, deleting the duplicate map
- [X] T028 [P] [US2] Drive the status options from data in `web/src/features/assets/NewAssetDialog.tsx` and `web/src/features/transfers/TransferDialog.tsx`, and the filter in `web/src/routes/Assets.tsx`
- [X] T029 [US2] Retire `zh.status` from `web/src/i18n/zh.ts`, add `zhStatuses`, and update the dynamic-index allowlist in `tests/i18n.test.ts`
- [X] T030 [US2] Add `internal/httpapi/statuses_test.go` — list is seeded and ordered; a custom status is usable end to end (create → transfer → overview card → refused delete); bad key and bad colour are 422, not 500

**Checkpoint**: 自定义状态可建、可选、可统计。

---

## Phase 4: User Story 3 — 状态携带行为 (Priority: P3)

**Goal**: 三个行为开关对自定义状态生效，对内置状态不可改。

**Independent Test**: 建一个终态，转进去后再转出被拒绝。

- [X] T031 [US3] Read `requires_location` from the set in `internal/asset/validate.go` and `internal/httpapi/handlers_assets.go`; the message names the status
- [X] T032 [US3] Filter the category distribution by `counts_as_available` in `internal/asset/overview.go`, grouping by `(category_id, status)` instead of hardcoding `status != 'retired'`
- [X] T033 [US3] Ignore the three behaviour fields for built-ins in `UpdateStatus` — silently, because they are not offered in the UI
- [X] T034 [US3] Add `internal/schema/status_store_test.go` covering the seeded behaviour equivalence, key/colour refusals carrying `ErrStatusInvalid`, sort placement, and that a built-in's flags survive a PATCH that tries to change them

**Checkpoint**: 自定义状态与内置状态携带同一类行为，来源不同。

---

## Phase 5: User Story 4 — 删掉不再需要的状态 (Priority: P4)

**Goal**: 自定义状态可删；内置不可删；历史提示而非拒绝。

**Independent Test**: 建一个状态并删除；再建一个、放设备进去，删除被拒且报出台数。

- [X] T035 [US4] Add `DeleteStatus` to `internal/schema/status_store.go` — refuse built-ins, refuse while assets hold it, report the count
- [X] T036 [US4] Add `StatusUsage` and `AllStatusUsage`, the latter counting history with a `UNION` so a same-status move is not counted twice (data-model.md §3)
- [X] T037 [US4] Add `deleteStatus` and `statusUsage` handlers plus `GET /status-usage`, and teach `unwrapSentinel` the two new sentinels
- [X] T038 [US4] Extend `internal/schema/status_store_test.go` with the two refusals, the history-only delete, and the double-count guard
- [X] T039 [US4] Extend `internal/httpapi/statuses_test.go` with the built-in refusal and the in-use refusal naming the count

**Checkpoint**: 删除的两条判定与 003 的信息项完全同形。

---

## Phase 6: 状态管理页与收尾

- [X] T040 Add `web/src/routes/Statuses.tsx` on `CrudPage` — table with badge, key, inline colour select, kind, behaviour, usage, delete
- [X] T041 Fetch the usage counts in the page only, under `[STATUSES_KEY, "usage"]`, and share `statusesQuery()` with `useStatuses` so one cache entry serves both (research.md D6)
- [X] T042 Put the built-in explanation above the table via CrudPage's `notice` slot, alongside the row-action error — a per-row repeat of it would be noise
- [X] T043 [P] Register `/statuses` in `web/src/routes/router.tsx` and the nav in `web/src/routes/AppShell.tsx`
- [X] T044 Add `web/tests/statuses.test.tsx` — seven cases: list with kind and behaviour, palette classes, no delete on built-ins, inline recolour, create with switches, the cost stated before deletion with the key typed to arm it, and a refusal surfacing above the table
- [X] T045 Update `specs/001-asset-ledger-demo/contracts/openapi.yaml` in place with the five new paths and the `Status` schema; diff the router against it
- [X] T046 Write `docs/design-baseline-v4.md` (decisions 53–60) and point `CLAUDE.md` at it
- [X] T047 Run the full gate: `go build ./... && go vet ./... && go test ./...`, `npm run typecheck && npm run lint && npm test && npm run build`
- [X] T048 Verify live against a running binary: seed, create, transfer, overview, refuse, delete, export, `nexus verify`

---

## Dependencies

```text
Phase 1 ──▶ 其余全部（AllStatuses 消失，七个文件同时改）
Phase 2 ──▶ Phase 6（页面复用 useStatuses 与徽章）
Phase 3 ──▶ Phase 4（行为开关先要能写进去）
Phase 3 ──▶ Phase 5（删除判定读的是同一个仓储）
```

## MVP 范围

**Phase 1 + Phase 2（US1）** 即可交付：升级后徽章立刻有颜色，不需要任何配置动作，
也不改变任何既有行为。US2–US4 是在此之上开放配置能力。

与 003 不同，这里**没有必须成对交付的故事** —— 每一阶段单独停下都不会让系统
比现状更差。

## 实现中发现、已修正的两处

1. **迁移的时间戳格式**（T002）。`datetime('now')` 产出的不是 RFC3339，
   `store.ParseTime` 拒绝它，表现是整个仓库的时间解析用例连锁失败，
   而错误信息指向被读取的资产而不是那次迁移。
2. **列表信封与缓存键冲突**（T041）。`GET /statuses` 最初返回
   `{items, colors, usage}`，状态管理页的表格与全局 `useStatuses` 争用同一个
   react-query 键却期望两种形状，后写入的赢。表现是颜色下拉空白。
   拆成两个端点、共用一个 `queryFn` 之后消失。
