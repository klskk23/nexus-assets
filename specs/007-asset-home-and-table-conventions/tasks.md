---

description: "Task list for 007-asset-home-and-table-conventions"
---

# Tasks: 资产归属与表格规范

**Input**: Design documents from `/specs/007-asset-home-and-table-conventions/`

**Tests**: 测试为**强制**要求（章程原则 II）：核心管线单元测试、每个端点的集成测试、
触及 UI 时的 DOM 测试。

## Phase 1: 资产归属 (US1, US2)

- [X] T001 Write `migrations/008_asset_home.sql` — three nullable columns on `assets`, no backfill: null already means what every existing row does
- [X] T002 Extend `internal/store/migrate_test.go` for the post-008 shape and one more rollback step
- [X] T003 Add `HomeHolder`/`HomeOwner` to `model.Asset`; read both halves of the holder or neither
- [X] T004 Add `HomeHolder`/`HomeOwnerID`/`ClearHome` to `asset.SaveInput`, and the create/update tri-state in `pipeline.go`
- [X] T005 Move check-in's destination resolution into `applyOne` — per asset, with the global default read once outside the transaction as the fallback
- [X] T006 Take the home owner along on check-in unless the caller named one
- [X] T007 Unpack the tri-state from `json.RawMessage` in `handlers_assets.go`, and resolve the home's names in `decorate` through the same helper the current holder uses
- [X] T008 Rewrite `TestCheckinWithoutADefaultStockPointAsksForALocation` — a new device now has a home, so the fixture has to clear it to reach that path
- [X] T009 Add `TestCheckinReturnsEachDeviceToItsOwnHome` — the case the whole feature exists for
- [X] T010 Add the endpoint test: a new device is at home where it was recorded, moving the home moves where check-in returns it
- [X] T011 [P] Add `home_holder`/`home_owner` to the frontend `Asset` type
- [X] T012 Add the home editor to `AssetDetail`, sending the fields explicitly since this form is where a home is cleared
- [X] T013 Let check-in name a destination in `TransferDialog`, defaulting to "each device's own home"
- [X] T014 Reset holder and owner when the action changes, not only when the dialog opens — otherwise picking 归还 from the toggle keeps the previous defaults
- [X] T015 Add the DOM cases: the default names no destination, a chosen one is sent

## Phase 2: 型号生命周期 (US4)

- [X] T016 Add `UpdateModelInput` (all pointers), `UpdateModel`, `ModelUsage`, `DeleteModel` to `internal/schema/model_store.go`
- [X] T017 Replace category links wholesale rather than diffing — the join table holds nothing a diff would preserve
- [X] T018 Add `ErrModelInvalid`/`ErrModelInUse` with catalogue entries in both languages, and map them in `FailErr`
- [X] T019 Add `PATCH`/`DELETE`/`GET usage` handlers and routes
- [X] T020 Add `internal/schema/model_lifecycle_test.go` — five cases: replacement, partial update, duplicate on rename, refusal while used, cascade of links

## Phase 3: 表格规范 (US3)

- [X] T021 Add `context-menu` and `dropdown-menu` via the shadcn CLI
- [X] T022 Give `ConfirmDialog` a controlled mode — a context menu closes as it fires, so a dialog cannot hang off it
- [X] T023 Add `onRowClick` and `rowActions` to `CrudPage`, with the pending confirmation parked in state and rendered outside the table
- [X] T024 Disable inapplicable actions rather than hiding them, the same choice 005 made for the 部门 option
- [X] T025 [P] Convert Fields, Models, Holders, Statuses and Users; drop every action column
- [X] T026 Build the Statuses and Models editors, which had none
- [X] T027 Add `web/src/test/menu.ts` — right-clicking is a pointer gesture, not a click
- [X] T028 Rewrite the DOM tests of all five pages against rows and menu items

## Phase 4: 收纳 (US5)

- [X] T029 Gather language, theme and sign-out into one `DropdownMenu` in `AppShell`
- [X] T030 Drop the trigger's `aria-label` — it was overriding the user's name, leaving a screen-reader user unable to hear whose session this is
- [X] T031 Shorten the ActionBar: Card's own `py-6`/`gap-6` was 48px of nothing around a 32px row
- [X] T032 Add the settings-menu DOM case, and rewrite the language test to go through it

## Phase 5: 收尾

- [X] T033 Update `specs/001-asset-ledger-demo/contracts/openapi.yaml` with the three model paths
- [X] T034 Update CLAUDE.md: the home, the table convention, the module-level trap still applies
- [X] T035 Run the full gate
- [X] T036 Verify live: a device's home, moving it, check-in following it, model edit/delete/refusal in both languages, `nexus verify`

## Dependencies

```text
Phase 1 与 Phase 2 独立
Phase 2 ──▶ Phase 3   （型号页的右键菜单需要它的编辑与删除先存在）
Phase 3 ──▶ Phase 4   （两者都动 AppShell 与测试助手）
```

## MVP 范围

**Phase 1** 独立可交付，也是三条里唯一改变数据的。
Phase 2–4 是界面与元数据的补齐，任一停下都不会让系统比现状更差。

## 实现中发现、已修正的三处

1. **归还的默认值只在对话框打开时设置**（T014）。从操作切换按钮选「归还」时，
   持有方与负责人仍是上一个操作的值，于是提交里多了两个不该有的字段。
2. **设置菜单的 `aria-label` 覆盖了用户名**（T030）。写测试时按不到用户名才发现 ——
   读屏用户听到的是「设置」，听不到当前是谁的会话。
3. **bundle 未压缩从 407KB 涨到 495KB**。门禁是 gzip 后 500KB（当前 161KB），
   仍有余量，但未压缩已逼近 Vite 的默认告警线。已登记在 plan 的边界里。
