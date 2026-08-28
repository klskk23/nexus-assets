---

description: "Task list for 001-asset-ledger-demo"
---

# Tasks: 资产台账与流转系统 Demo

**Input**: Design documents from `/specs/001-asset-ledger-demo/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 测试为**强制**要求（章程原则 II，NON-NEGOTIABLE）。每个特性必须包含：
核心管线逻辑的单元测试、每个 HTTP 端点的集成测试（真实 SQLite 临时库）、
以及**触及 UI 时的 DOM 测试**（Vitest + React Testing Library）。不得省略。

**Organization**: 任务按用户故事分组，使每个故事都能独立实现、独立测试、独立交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[Story]**: 所属用户故事（US1–US6）
- 描述中必须含确切文件路径

## Path Conventions

后端 `cmd/nexus/`、`internal/`、`migrations/`；前端 `web/src/`、`web/tests/`。
目录划分见 plan.md「Project Structure」。

## 关于 Foundational 阶段为何偏大

本系统是**元数据驱动**的：资产要填哪些信息、编号怎么生成，全部由运行时可配的类别与
信息项决定。因此「录入一台设备」在代码上依赖类别树解析、有效字段集并集、模板求值与
DAG 环检测这一整套机器 —— 它们无法拆进任何单个用户故事。Phase 2 完成后，US1 至 US6
才可以真正并行开工。

---

## Phase 1: Setup（共享基础设施）

**Purpose**: 工程骨架与工具链，跑通七条合并门禁的空壳

- [X] T001 Create repository skeleton (`cmd/nexus/`, `internal/`, `migrations/`, `web/`) per plan.md「Project Structure」
- [X] T002 [P] Initialize Go module in `go.mod` (Go 1.23+) with gin, modernc.org/sqlite, pressly/goose/v3, coreos/go-oidc/v3, golang.org/x/oauth2, golang-jwt/jwt/v5
- [X] T003 [P] Configure linters in `.golangci.yml` — enable gocyclo with max 15, errcheck, govet, ineffassign (章程原则 I)
- [X] T004 [P] Scaffold Vite + React + TypeScript in `web/` (`web/package.json`, `web/vite.config.ts`)
- [X] T005 [P] Configure Tailwind CSS in `web/tailwind.config.ts` and `web/src/index.css`
- [X] T006 [P] Initialize shadcn/ui in `web/components.json`; add Button, Card, Input, Select, Table, Dialog, AlertDialog, Collapsible, Form, Sonner, Progress, Separator, Skeleton, Badge, Checkbox, Textarea, Calendar
- [X] T007 [P] Configure Vitest + React Testing Library + jsdom in `web/vitest.config.ts` and `web/src/test/setup.ts`
- [X] T008 [P] Configure ESLint, Prettier and strict TypeScript in `web/eslint.config.js` and `web/tsconfig.json`
- [X] T009 [P] Add react-router and route shell in `web/src/main.tsx` and `web/src/routes/router.tsx` (章程 v1.1.0 技术栈)
- [X] T010 Create `web/src/components/custom/README.md` stating that any component here requires prior developer approval (章程原则 III，不接受事后补批)
- [X] T011 [P] Add `Makefile` with `dev`, `build`, `test`, `lint`, `verify`, `gates` targets per quickstart.md
- [X] T012 [P] Add CI workflow in `.github/workflows/ci.yml` running all seven merge gates from `.specify/memory/constitution.md`
- [X] T013 [P] Add `.gitignore` entries for `nexus.db`, `nexus.db-wal`, `nexus.db-shm`, `web/dist`, `web/node_modules`
- [X] T014 Add `web/dist/.gitkeep` so `embed.FS` compiles before the first frontend build (否则 `go build` 在干净检出上直接失败)

---

## Phase 2: Foundational（阻塞所有用户故事）

**Purpose**: 数据层、元数据机器、认证与前端骨架

**⚠️ CRITICAL**: 本阶段完成前，任何用户故事都无法开工

### 配置与存储层

- [X] T015 Implement environment config loader in `internal/config/config.go` — **refuse to start when `NEXUS_JWT_SECRET` is missing**, never auto-generate
- [X] T016 [P] Unit test config fail-fast and defaults in `internal/config/config_test.go`
- [X] T017 Implement dual-pool SQLite opener in `internal/store/store.go` — write pool `SetMaxOpenConns(1)` with `_txlock=immediate`, read pool unrestricted, both on the same file (research.md D3)
- [X] T018 Implement pragma read-back assertions in `internal/store/pragma.go` — after connect run `PRAGMA journal_mode` and `PRAGMA busy_timeout`, return error on mismatch (research.md D1)
- [X] T019 Unit test pragma read-back rejects a DSN with mattn-style `_journal_mode=WAL` syntax in `internal/store/pragma_test.go`
- [X] T020 Integration test that a second connection gets busy while a write tx is open, proving `BEGIN IMMEDIATE` took effect, in `internal/store/txlock_test.go` (research.md D2)
- [X] T021 [P] Integration test that reads are not blocked by an open write transaction in `internal/store/concurrency_test.go`
- [X] T022 Implement `Read()` and `Write(fn)` transaction helpers in `internal/store/tx.go` — do not expose raw `*sql.DB` to callers

### 迁移

- [X] T023 Write all nine tables in `migrations/001_init.sql` with goose annotations per data-model.md §2
- [X] T024 Add `ix_assets_mac` expression index and `ux_default_stock` partial unique index to `migrations/001_init.sql` (ORM 无法表达，必须手写)
- [X] T025 Wire goose with `embed.FS` and auto-migrate on startup in `internal/store/migrate.go`
- [X] T026 [P] Integration test migrate up and down in `internal/store/migrate_test.go`

### 领域模型

- [X] T027 [P] Define domain structs and enums in `internal/model/model.go`
- [X] T028 [P] Implement the status transition table in `internal/model/status.go` per data-model.md §3 — `retired` is terminal, `lost` may only go to `in_stock` or `retired`
- [X] T029 [P] Unit test every legal and illegal transition pair in `internal/model/status_test.go`
- [X] T030 [P] Implement transfer-kind derivation in `internal/model/transferkind.go` per data-model.md §4 — status transition takes precedence over holder change
- [X] T031 [P] Unit test derivation precedence, especially that checkout is not mis-labelled as transfer, in `internal/model/transferkind_test.go`

### 类别与信息项机器

- [X] T032 Implement materialized-path parsing and effective field set resolution in `internal/schema/resolve.go` per data-model.md §6
- [X] T033 [P] Implement per-type `options` contract deserialization in `internal/schema/options.go` per data-model.md and contracts/openapi.yaml `FieldSchema`
- [X] T034 Unit test inheritance across a three-level tree, including `inherited_from` attribution, in `internal/schema/resolve_test.go`
- [X] T035 [P] Unit test options deserialization for all ten field types in `internal/schema/options_test.go`

### 模板求值引擎

- [X] T036 [P] Implement the FuncMap whitelist (`hex2dec`, `dec2hex`, `pad`, `trunc`, `slice`, `upper`, `lower`, `trim`, `replace`, `default`, `printf`) in `internal/compute/funcs.go`
- [X] T037 Implement template parsing with `if`/`range`/`with` rejection by walking `tmpl.Tree.Root` in `internal/compute/parse.go` (research.md D6)
- [X] T038 Implement dependency extraction from `*parse.FieldNode` in `internal/compute/deps.go` — **parse tree only, never regex**
- [X] T039 Implement topological sort and cycle detection in `internal/compute/dag.go`
- [X] T040 [P] Unit test `hex2dec` against `00:1A:2B:3C:4D:5E` → `112394521950` in `internal/compute/funcs_test.go`
- [X] T041 [P] Unit test rejection of `if`/`range` templates and of unknown function names in `internal/compute/parse_test.go`
- [X] T042 [P] Unit test dependency extraction through nested pipelines such as `{{ printf "%s-%s" .category.code (.attrs.mac | hex2dec) }}` in `internal/compute/deps_test.go`
- [X] T043 [P] Unit test detection of a three-node cycle with the cycle path in the error in `internal/compute/dag_test.go`

### 认证

- [X] T044 [P] Implement JWT issue and verify with 8h TTL and no refresh in `internal/auth/jwt.go`
- [X] T045 Implement Google OIDC flow in `internal/auth/oidc.go` — verify signature, `email_verified`, then `hd` claim or email suffix per `NEXUS_OIDC_REQUIRE_HD` (research.md D5)
- [X] T046 [P] Implement local password authentication in `internal/auth/local.go`
- [X] T047 Implement auth middleware in `internal/auth/middleware.go`
- [X] T048 [P] Implement bootstrap admin creation when the users table is empty in `internal/auth/bootstrap.go`
- [X] T049 Integration test the three domain-admission branches (`hd` matches, `hd` missing, `hd` mismatched) with constructed ID token claims in `internal/auth/oidc_test.go`

### HTTP 层骨架

- [X] T050 Implement error envelope and the thirteen error codes in `internal/httpapi/errors.go` per contracts/README.md
- [X] T051 [P] Implement Chinese user-facing messages in `internal/httpapi/messages.go` (i18n 例外，集中管理)
- [X] T052 [P] Implement pagination helper with default 50 and hard cap 200 in `internal/httpapi/paging.go`
- [X] T053 Wire the gin router and `embed.FS` static serving in `cmd/nexus/main.go`

### 元数据基础 CRUD（US1 的前置）

- [X] T054 Implement category store with tree operations in `internal/schema/category_store.go`
- [X] T055 [P] Implement field definition store in `internal/schema/field_store.go`
- [X] T056 Implement category-field binding with key-conflict rejection against the ancestor chain in `internal/schema/binding.go` (FR-021)
- [X] T057 [P] Implement product model store with `attr_defaults` in `internal/schema/model_store.go`
- [X] T058 [P] Implement holder entity store, tree and default stock point in `internal/holder/store.go`
- [X] T059 [P] Implement user store in `internal/auth/store.go`
- [X] T060 Implement `GET /api/categories/:id/schema` returning the effective field set and inherited `sn_template` in `internal/httpapi/schema.go`
- [X] T061 Implement metadata CRUD handlers for categories, fields, models, holders and users in `internal/httpapi/metadata.go`
- [X] T062 Integration tests for every metadata endpoint against a real temp SQLite database in `internal/httpapi/metadata_test.go`

### 前端骨架

- [X] T063 [P] Implement the API client with error envelope parsing in `web/src/lib/api.ts`
- [X] T064 [P] Define query keys and the QueryClient configuration in `web/src/lib/queryClient.ts`
- [X] T065 [P] Implement the `renderWithProviders` test helper with a fresh QueryClient, `retry: false`, `gcTime: 0` in `web/src/test/renderWithProviders.tsx` (research.md D8)
- [X] T066 [P] Implement the loading/empty/error three-state boundary in `web/src/components/StateBoundary.tsx` (章程原则 III)
- [X] T067 [P] Create all Chinese user-facing strings in `web/src/i18n/zh.ts`
- [X] T068 [P] Implement the app shell and navigation in `web/src/routes/AppShell.tsx`
- [X] T069 Implement the recursive tree using shadcn/ui `Collapsible` in `web/src/features/tree/CollapsibleTree.tsx` — **不引入自定义树组件**；若该方案在深层树下不可接受，暂停并与开发者确认 (research.md D7)
- [X] T070 [P] DOM test three-level expand, collapse and selection in `web/tests/tree.test.tsx`
- [X] T071 Implement metadata management pages in `web/src/routes/Fields.tsx`, `Models.tsx`, `Holders.tsx`, `Users.tsx`
- [X] T072 [P] DOM tests for the four metadata pages in `web/tests/metadata.test.tsx`

**Checkpoint**: 基础就绪 —— US1 至 US6 可以开始并行开工

---

## Phase 3: User Story 1 — 新设备入库与查找 (Priority: P1) 🎯 MVP

**Goal**: 设备能录进来、编号自动生成、之后找得到。交付这一个故事，公司就从「设备记在
Excel 和记忆里」变成「设备有账可查」。

**Independent Test**: 用一个空系统，配置一个类别与必要信息项后录入 10 台设备，
再分别用资产编号、MAC、型号名的一部分搜索，均能定位到正确设备。

### Tests for User Story 1 (REQUIRED - 章程原则 II) ⚠️

> **先写这些测试，确认它们失败，再写实现**

- [X] T073 [P] [US1] Integration test that saving an asset generates the SN from MAC in `internal/asset/pipeline_test.go`
- [X] T074 [P] [US1] Integration test that the same MAC written as `00:1A:2B:3C:4D:5E`, `00-1a-2b-3c-4d-5e` and `001A2B3C4D5E` is rejected as duplicate, in `internal/asset/unique_test.go`
- [X] T075 [P] [US1] Integration test that correcting the MAC regenerates the SN, archives the old one, and that the old SN still resolves, in `internal/asset/sn_test.go`
- [X] T076 [P] [US1] Integration test that a unique exact `q` match returns `exact_match_id`, and a partial model name returns a list, in `internal/httpapi/assets_test.go`
- [X] T077 [P] [US1] Integration test that a stale `version` yields `409 version_conflict` in `internal/httpapi/assets_test.go`
- [X] T078 [P] [US1] Integration test that listing 50 assets issues a constant number of SQL statements regardless of row count in `internal/asset/list_test.go` (无 N+1，章程原则 IV)

### Implementation for User Story 1

- [X] T079 [US1] Implement MAC, IP and URL normalization in `internal/asset/normalize.go` — MAC to uppercase, no separators, 12 hex chars
- [X] T080 [US1] Implement the type, required and regex validation stage in `internal/asset/validate.go`
- [X] T081 [US1] Implement the holder and status coupling rule (`in_stock` requires a `location` entity) in `internal/asset/validate.go` per data-model.md §3
- [X] T082 [US1] Implement the computed evaluation stage in topological order in `internal/asset/compute_stage.go`
- [X] T083 [US1] Implement SN evaluation from the inherited `sn_template` in `internal/asset/sn.go`
- [X] T084 [US1] Implement the in-transaction uniqueness check stage in `internal/asset/unique.go`
- [X] T085 [US1] Implement SN history archiving on change in `internal/asset/snhistory.go`
- [X] T086 [US1] Implement the optimistic-lock write stage in `internal/asset/write.go`
- [X] T087 [US1] Implement the pipeline orchestrator calling the stages **in the order fixed by data-model.md** — normalization must precede the uniqueness check — in `internal/asset/pipeline.go`
- [X] T088 [US1] Implement exact-first then substring search in `internal/asset/search.go`
- [X] T089 [US1] Implement list query with batched holder, owner and model name lookup in `internal/asset/list.go`
- [X] T090 [US1] Implement asset handlers (list, create, get, patch, delete with `confirm_sn`) in `internal/httpapi/assets.go`

### Frontend for User Story 1

- [X] T091 [P] [US1] Implement the login page with local form and Google button in `web/src/routes/Login.tsx`
- [X] T092 [P] [US1] DOM test login form validation and redirect on success in `web/tests/login.test.tsx`
- [X] T093 [US1] Implement the schema-driven dynamic form in `web/src/features/assets/DynamicForm.tsx` — all ten field types rendered from `/categories/:id/schema`
- [X] T094 [US1] DOM test that the dynamic form renders every field type and maps `error.fields` to the right input in `web/tests/dynamicForm.test.tsx`
- [X] T095 [US1] Implement the asset list page with filters, column selector persisted to `localStorage`, and **search box autofocus on mount** in `web/src/routes/Assets.tsx` (FR-066)
- [X] T096 [US1] DOM test filtering, column selector persistence and search autofocus in `web/tests/assets.test.tsx`
- [X] T097 [US1] Implement the asset detail page with an archived-fields collapsible section in `web/src/routes/AssetDetail.tsx`
- [X] T098 [US1] DOM test the detail page and the 409 conflict prompt in `web/tests/assetDetail.test.tsx`

**Checkpoint**: US1 独立可用 —— 可以录入、搜索、查看、编辑设备

---

## Phase 4: User Story 2 — 设备流转与责任追溯 (Priority: P2)

**Goal**: 每次移动都留下不可变记录，随时回答「现在在谁那」与「去过哪里」。

**Independent Test**: 在已有设备的系统上完成一次单台签出、一次归还、一次 20 台批量调拨，
然后在任一设备详情页读出完整经手时间线。

### Tests for User Story 2 (REQUIRED - 章程原则 II) ⚠️

- [ ] T099 [P] [US2] Integration test that checkout writes one transfer with full from/to values and flips status in `internal/transfer/transfer_test.go`
- [ ] T100 [P] [US2] Integration test that a 20-asset batch writes 20 rows sharing one `batch_id` in a single transaction in `internal/transfer/batch_test.go`
- [ ] T101 [P] [US2] Integration test that the tail event is editable, a non-tail event yields `409 not_tail_event`, and `edited_*` is written, in `internal/transfer/edit_test.go`
- [ ] T102 [P] [US2] Integration test that illegal transitions (`retired` to anything, `lost` to `in_use`) yield `422 illegal_transition` in `internal/transfer/status_test.go`
- [ ] T103 [P] [US2] Integration test that disabling a user who still owns assets yields `409 reference_blocked` in `internal/httpapi/users_test.go`

### Implementation for User Story 2

- [ ] T104 [US2] Implement single transfer with kind derivation and status validation in `internal/transfer/transfer.go`
- [ ] T105 [US2] Implement batch transfer sharing a `batch_id` in one transaction in `internal/transfer/batch.go`
- [ ] T106 [US2] Implement tail-event editing with `edited_at`/`edited_by`/`original` in `internal/transfer/edit.go` — batch events edit as a whole only
- [ ] T107 [US2] Implement check-in defaulting to the default stock point, requiring an explicit location when none is set, in `internal/transfer/checkin.go` (FR-065)
- [ ] T108 [US2] Implement transfer handlers in `internal/httpapi/transfers.go`

### Frontend for User Story 2

- [ ] T109 [US2] Implement the transfer timeline with batch folding in `web/src/features/transfers/Timeline.tsx`
- [ ] T110 [US2] DOM test that a 20-row batch renders folded as one entry in `web/tests/timeline.test.tsx`
- [ ] T111 [US2] Implement the multi-select action bar (签出/归还/转移/改负责人/改状态) in `web/src/features/assets/ActionBar.tsx`
- [ ] T112 [US2] DOM test multi-select then batch submit produces one request with all asset ids in `web/tests/actionBar.test.tsx`
- [ ] T113 [US2] Implement tail-event editing UI with the modification trace shown in `web/src/features/transfers/EditEvent.tsx`
- [ ] T114 [US2] DOM test that a non-tail event offers no edit affordance in `web/tests/editEvent.test.tsx`

**Checkpoint**: US2 独立可用 —— 流转与追溯完整

---

## Phase 5: User Story 3 — 类别与信息项自助配置 (Priority: P3)

**Goal**: 管理员不改代码就能新增类别、定义信息项、配置编号规则。

**Independent Test**: 全程只在界面上操作，新建一个类别树节点、绑定信息项、
配置一条编号规则，然后在该类别下成功录入一台设备。

### Tests for User Story 3 (REQUIRED - 章程原则 II) ⚠️

- [ ] T115 [P] [US3] Integration test that a child category inherits all ancestor fields and may only append in `internal/schema/inherit_test.go`
- [ ] T116 [P] [US3] Integration test that saving a cyclic computed rule yields `422 template_invalid` with the cycle path in `internal/httpapi/fields_test.go`
- [ ] T117 [P] [US3] Integration test that disabling a field referenced by `sn_template` yields `409 reference_blocked` listing the referrers in `internal/httpapi/fields_test.go`
- [ ] T118 [P] [US3] Integration test that `recompute-sn?dry_run=true` writes nothing and reports conflicts, and that a real run with any conflict rolls back entirely, in `internal/asset/recompute_test.go`
- [ ] T119 [P] [US3] Integration test that moving a category with assets in its subtree yields `409 category_has_assets` in `internal/httpapi/categories_test.go`
- [ ] T120 [P] [US3] Integration test that a removed enum option is retained on existing assets, flagged deprecated, and rejected for new records, in `internal/schema/enum_test.go`

### Implementation for User Story 3

- [ ] T121 [US3] Implement reverse-dependency scanning across all computed templates and `sn_template` in `internal/schema/refcheck.go`
- [ ] T122 [US3] Implement the two-phase SN recompute (dry run then transactional apply with全量 rollback on conflict) in `internal/asset/recompute.go`
- [ ] T123 [US3] Implement the category move guard in `internal/schema/category_store.go`
- [ ] T124 [US3] Implement enum option deprecation semantics in `internal/schema/options.go`
- [ ] T125 [US3] Implement the recompute and category handlers in `internal/httpapi/categories.go`

### Frontend for User Story 3

- [ ] T126 [US3] Implement the category tree page reusing `CollapsibleTree`, showing which ancestor each field is inherited from, in `web/src/routes/Categories.tsx`
- [ ] T127 [US3] DOM test that an inherited field displays its `inherited_from` attribution in `web/tests/categories.test.tsx`
- [ ] T128 [US3] Implement the `sn_template` editor with a recompute preview dialog in `web/src/features/categories/SnTemplateEditor.tsx`
- [ ] T129 [US3] DOM test that the preview shows affected count and conflicts before any apply is possible in `web/tests/snTemplate.test.tsx`
- [ ] T130 [US3] Implement the field definition editor with per-type options forms in `web/src/features/fields/FieldEditor.tsx`
- [ ] T131 [US3] DOM test that attempting to disable a referenced field surfaces the referrer list in `web/tests/fieldEditor.test.tsx`

**Checkpoint**: US3 独立可用 —— 配置完全自助

---

## Phase 6: User Story 4 — 存量设备批量导入与导出 (Priority: P4)

**Goal**: 几百台存量设备能一次性进系统；清单能导出。

**Independent Test**: 下载模板，填 120 行（含 3 行错误），预览后确认这 3 行被精确指出
且库中无写入；修正后确认导入，120 台全部入库。

### Tests for User Story 4 (REQUIRED - 章程原则 II) ⚠️

- [ ] T132 [P] [US4] Integration test that the template's second header row matches the category's effective field keys in `internal/importer/template_test.go`
- [ ] T133 [P] [US4] Integration test that preview reports per-row errors and writes nothing in `internal/importer/preview_test.go`
- [ ] T134 [P] [US4] Integration test that a duplicate MAC **within the uploaded file** is caught, not only against existing rows, in `internal/importer/preview_test.go`
- [ ] T135 [P] [US4] Integration test that commit is all-or-nothing and writes one `create` transfer per row sharing a `batch_id` in `internal/importer/commit_test.go`
- [ ] T136 [P] [US4] Integration test that a row referencing an unknown model or location errors instead of auto-creating in `internal/importer/preview_test.go`
- [ ] T137 [P] [US4] Integration test that export honours the current filter parameters in `internal/httpapi/export_test.go`

### Implementation for User Story 4

- [ ] T138 [US4] Implement the two-row-header CSV template generator in `internal/importer/template.go`
- [ ] T139 [US4] Implement per-row preview running the full save pipeline without persisting in `internal/importer/preview.go`
- [ ] T140 [US4] Implement name-based resolution of model and reference columns, erroring on miss, in `internal/importer/resolve.go`
- [ ] T141 [US4] Implement single-transaction commit in `internal/importer/commit.go`
- [ ] T142 [US4] Implement CSV export honouring list filters in `internal/importer/export.go`
- [ ] T143 [US4] Implement import and export handlers in `internal/httpapi/importexport.go`

### Frontend for User Story 4

- [ ] T144 [US4] Implement the import page (download template → upload → preview → commit) in `web/src/routes/Import.tsx`
- [ ] T145 [US4] DOM test that the preview lists each failing line with its reason and blocks commit until resolved in `web/tests/import.test.tsx`
- [ ] T146 [US4] Add the export button honouring current filters to `web/src/routes/Assets.tsx`
- [ ] T147 [US4] DOM test that export is invoked with the active filter parameters in `web/tests/export.test.tsx`

**Checkpoint**: US4 独立可用 —— 存量数据可批量进出

---

## Phase 7: User Story 5 — 配置变更的安全护栏与审计 (Priority: P5)

**Goal**: 调整配置不会静默损坏数据；任何变更事后可查。

**Independent Test**: 依次尝试删除仍被持有的位置、停用仍有设备的账号、删除一台设备，
确认每项都被正确拦截或要求确认；随后在审计记录中查到完整轨迹。

> **说明**：US5 的验收场景 4（并发编辑）由 US1 的乐观锁实现覆盖（T086、T077、T098）。
> 本阶段只补一条端到端验收，不重复实现。

### Tests for User Story 5 (REQUIRED - 章程原则 II) ⚠️

- [ ] T148 [P] [US5] Integration test that deleting a holder entity still held by assets or targeted by a reference field yields `409 reference_blocked` with the blocking assets listed in `internal/holder/refcheck_test.go`
- [ ] T149 [P] [US5] Integration test that every metadata create, update and archive writes an audit entry with actor, time and before/after in `internal/audit/audit_test.go`
- [ ] T150 [P] [US5] Integration test that deleting an asset without a matching `confirm_sn` is refused in `internal/httpapi/assets_test.go`
- [ ] T151 [P] [US5] End-to-end test of the concurrent edit scenario (US5 AS4) in `internal/httpapi/concurrency_test.go`

### Implementation for User Story 5

- [ ] T152 [US5] Implement holder reference-integrity checks covering both possession and reference fields in `internal/holder/refcheck.go`
- [ ] T153 [US5] Implement the audit writer in `internal/audit/audit.go`
- [ ] T154 [US5] Hook the audit writer into every metadata mutation in `internal/httpapi/metadata.go`
- [ ] T155 [US5] Implement the audit query endpoint with target-type and time-range filters in `internal/httpapi/audit.go`

### Frontend for User Story 5

- [ ] T156 [US5] Implement the audit log page in `web/src/routes/Audit.tsx`
- [ ] T157 [US5] DOM test audit filtering by target type and time range in `web/tests/audit.test.tsx`
- [ ] T158 [US5] Implement destructive-action confirmation dialogs using shadcn/ui `AlertDialog`, requiring SN entry for asset deletion, in `web/src/features/common/ConfirmDialog.tsx`
- [ ] T159 [US5] DOM test that the delete button stays disabled until the typed SN matches in `web/tests/confirmDialog.test.tsx`

**Checkpoint**: US5 独立可用 —— 数据受保护且变更可追溯

---

## Phase 8: User Story 6 — 首页概览与快速录入 (Priority: P6)

**Goal**: 登录第一屏看清全局，并能一步开始录入。

**Independent Test**: 在已有设备与流转的系统上打开首页，核对各状态台数与列表页筛选一致；
点击卡片进入对应筛选列表；从快速录入卡片选类别后直接进入录入表单。

### Tests for User Story 6 (REQUIRED - 章程原则 II) ⚠️

- [ ] T160 [P] [US6] Integration test that `status_counts` equals the count from the list endpoint filtered by each status in `internal/httpapi/overview_test.go`
- [ ] T161 [P] [US6] Integration test that `category_distribution` includes descendants and **excludes** retired assets in `internal/httpapi/overview_test.go`
- [ ] T162 [P] [US6] Integration test that recent transfers fold a shared `batch_id` into one entry in `internal/httpapi/overview_test.go`

### Implementation for User Story 6

- [ ] T163 [US6] Implement the overview aggregation query in `internal/asset/overview.go` — constant number of SQL statements, no per-category loop
- [ ] T164 [US6] Implement the overview handler in `internal/httpapi/overview.go`

### Frontend for User Story 6

- [ ] T165 [US6] Implement the overview page with status cards, category distribution using `Progress` bars (**no chart library**, research.md D9), recent transfers and a quick-entry card, in `web/src/routes/Overview.tsx`
- [ ] T166 [US6] DOM test that clicking a status card navigates to the correspondingly filtered asset list in `web/tests/overview.test.tsx`
- [ ] T167 [US6] DOM test that the quick-entry card prompts to configure a category first when none exist in `web/tests/overview.test.tsx`
- [ ] T168 [US6] Make the overview the default landing route in `web/src/routes/router.tsx`

**Checkpoint**: 全部六个故事完成

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T169 Implement the `nexus verify` reconciliation command in `cmd/nexus/verify.go` — check both the tail snapshot match and adjacent-event `from_*`/`to_*` chain integrity per data-model.md §7
- [ ] T170 Unit test verify against a deliberately drifted database in `cmd/nexus/verify_test.go`
- [X] T171 Add `nexus verify` to the CI workflow in `.github/workflows/ci.yml`
- [ ] T172 Add a 10,000-asset seed generator in `cmd/nexus/seed.go` for performance verification (dev-only, not shipped as demo data — FR-062)
- [ ] T173 Measure and assert list p95 < 200ms and single read/write p95 < 100ms on the 10k seed in `internal/httpapi/perf_test.go` (章程原则 IV)
- [X] T174 [P] Add an initial-chunk size check (< 500KB gzip) to `.github/workflows/ci.yml`
- [X] T175 [P] Add route-level code splitting for management pages in `web/src/routes/router.tsx`
- [X] T176 [P] Verify core pipeline package coverage ≥ 80% in the CI workflow for `internal/schema`, `internal/asset`, `internal/compute`
- [ ] T177 [P] Audit keyboard reachability and visible focus across all eleven routes in `web/tests/a11y.test.tsx` (章程原则 III)
- [ ] T178 [P] Verify every user-facing string lives in `web/src/i18n/zh.ts` or `internal/httpapi/messages.go`, none inline (章程原则 V)
- [ ] T179 Update `docs/design-baseline.md` with the three rules added during planning (status machine, holder/status coupling, transfer-kind derivation) so the design doc stays the source of truth
- [ ] T180 Run all seven merge gates end to end per quickstart.md and record the result in the PR

---

## Dependencies

### 阶段顺序

```
Phase 1 Setup
    ↓
Phase 2 Foundational   ← 阻塞一切
    ↓
    ├── Phase 3 US1 (P1)  🎯 MVP
    ├── Phase 4 US2 (P2)
    ├── Phase 5 US3 (P3)
    ├── Phase 6 US4 (P4)
    ├── Phase 7 US5 (P5)
    └── Phase 8 US6 (P6)
              ↓
        Phase 9 Polish
```

### 故事之间的真实依赖

Phase 2 完成后，六个故事在**代码层面**互不阻塞 —— 各自的文件不重叠。
但在**验收层面**存在数据依赖，做计划时要知道：

| 故事 | 代码依赖 | 验收数据依赖 |
|------|----------|--------------|
| US1 | 仅 Phase 2 | 无 |
| US2 | 仅 Phase 2 | 需要 US1 能录入设备才有东西可流转 |
| US3 | 仅 Phase 2 | 「重算存量编号」需要 US1 已产生存量资产 |
| US4 | 仅 Phase 2 | 预览复用 US1 的保存管线（T087） |
| US5 | 仅 Phase 2 | 无（AS4 由 US1 覆盖） |
| US6 | 仅 Phase 2 | 计数与折叠需要 US1、US2 的数据 |

US4 的 T139 直接调用 US1 的 `internal/asset/pipeline.go` —— 这是唯一一处跨故事的代码
依赖，若要严格并行，US4 需先给管线打一个桩。

## Parallel Execution Examples

**Phase 2 内部**，下列组可各自并行：

```
组 A（存储）：T016, T021, T026
组 B（领域模型）：T027, T028, T030 → 随后 T029, T031
组 C（模板引擎）：T036 → T040；T037/T038/T039 顺序，随后 T041, T042, T043 并行
组 D（前端骨架）：T063, T064, T065, T066, T067, T068 全部可并行
```

**Phase 3 US1**：六条测试 T073–T078 全部可并行编写；实现阶段 T079–T087 是管线的顺序
环节不可并行；前端 T091/T092 可与后端并行。

**跨故事**：Phase 2 完成后，把 US1 与 US3 交给两个人是最有效的切分 ——
US1 做资产主线，US3 做配置与护栏，两者文件完全不重叠。

## Implementation Strategy

### MVP 范围

**Phase 1 + Phase 2 + Phase 3（US1）**，共 98 个任务。

交付后系统即可用：登录、配置类别与信息项、录入设备、自动生成编号、搜索与查看。
这就是「设备有账可查」的完整切片。此时**还不能**记录流转 —— 那是 US2。

### 增量顺序

1. **US1** → 台账存在
2. **US2** → 流转可追溯（用户提需求的直接动机，建议紧随其后）
3. **US4** → 存量设备进得来（决定系统能否真正启用，实践上可能比 US3 更急）
4. **US3** → 配置自助（新增设备种类不再需要发版）
5. **US5** → 护栏与审计
6. **US6** → 首页概览

> 注意：spec 里 US3 优先级高于 US4，但如果公司有几百台存量设备等着入库，
> 实际交付时把 US4 提前会更快见效 —— 这不改变规格，只是排期建议。

### 每个阶段结束时

跑一遍 quickstart.md 的七条合并门禁。不要攒到最后 —— 覆盖率与 DOM 测试是
章程 NON-NEGOTIABLE 的门禁，补起来比同步写贵得多。
