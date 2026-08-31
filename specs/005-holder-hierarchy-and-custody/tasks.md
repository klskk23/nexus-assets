---

description: "Task list for 005-holder-hierarchy-and-custody"
---

# Tasks: 持有方层级与保管责任

**Input**: Design documents from `/specs/005-holder-hierarchy-and-custody/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 测试为**强制**要求（章程原则 II，NON-NEGOTIABLE）。每个特性必须包含：
核心管线逻辑的单元测试、每个 HTTP 端点的集成测试（真实 SQLite 临时库）、
以及**触及 UI 时的 DOM 测试**（Vitest + React Testing Library）。不得省略。

**Organization**: 任务按用户故事分组。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[Story]**: 所属用户故事（US1–US5）

## Path Conventions

沿用 001 的结构。**本轮不新增文件**（除测试）。

## 关于先做核对

本轮的第一件事不是写代码，而是把报告的现象跑一遍。用户说「在库设备无法转移到其他位置」，
实测位置到位置一直是通的，被挡住的是公司与部门。照着报告的说法去修，
会去改一个没有坏的地方。

---

## Phase 0: 核对（阻塞 US1）

- [X] T001 Reproduce the report against a running binary: transfer an in-stock asset to another location (succeeds), to a company (refused), to a department (refused). Record the finding in research.md D1
- [X] T002 Audit every reader of `requires_location` — only the two holder checks read it, while `counts_as_available` and `terminal` have real dependents. This is what makes it a policy rather than a rule (research.md D2)

---

## Phase 1: Foundational

- [X] T003 Write `migrations/005_holder_hierarchy.sql` — add `holder_entities.note`, add `ix_holder_parent`, clear `statuses.in_stock.requires_location`. No table rebuild
- [X] T004 Write the Down migration — `DROP COLUMN` (SQLite 3.35+; the bundled engine is 3.53) plus restoring the flag, verified by an up/down round trip
- [X] T005 Extend `internal/store/migrate_test.go` for the post-005 shape and for both revisions of the rollback
- [X] T006 Add `Note` to `model.HolderEntity` and to the holder store's column list and scanner

---

## Phase 2: User Story 1 — 把库存交给部门保管 (Priority: P1) 🎯 MVP

- [X] T007 [US1] Unlock `requires_location` for built-ins in `internal/schema/status_store.go`, keeping the other two locked, with the audit from T002 written into the comment
- [X] T008 [US1] Add `transfer.ErrHolderKind` and wrap both refusal sites in `internal/transfer/transfer.go`; the message names the status by its configured label
- [X] T009 [US1] Route it to 422 on `to_holder_id` in `internal/httpapi/handlers_transfers.go`, and drop 「位置」 from `isTransitionError`'s keyword list
- [X] T010 [US1] Rewrite the three tests that encoded the removed rule so they assert the new one plus the switch still biting when turned on (`internal/asset`, `internal/transfer`, `internal/schema`)
- [X] T011 [US1] Expose the switch as a per-row checkbox in `web/src/routes/Statuses.tsx` — a flag flipped by a migration with no UI trace is worse than one you can see
- [X] T012 [US1] Add `internal/httpapi/holders_test.go` cases: stock handed to a department succeeds; with the switch on it is refused, tagged to `to_holder_id` and **not** mentioning `to_status`

**Checkpoint**: 在库设备可以交给任何持有方；想要旧行为的人勾一下就有。

---

## Phase 3: User Story 2 — 交给组织时仍然有人负责 (Priority: P2)

- [X] T013 [US2] Add the responsible-party select to `web/src/features/transfers/TransferDialog.tsx` for checkout/transfer-to-entity and for check-in, defaulting to the signed-in account
- [X] T014 [US2] Offer 「不变」 as an explicit choice that omits `to_owner_id`, and list only active accounts
- [X] T015 [US2] Add `web/tests/transferDialog.test.tsx` — four cases covering account (no picker), entity (picker, default), plain transfer, and check-in with 「不变」
- [X] T016 [US2] Add an endpoint test that a checkout naming an owner actually moves it

---

## Phase 4: User Story 3 + 4 — 备注与层级 (Priority: P3, P4)

- [X] T017 [US3] Accept and return `note` in `POST /holders` and `PATCH /holders/{id}`
- [X] T018 [US4] Add `allowedParents`, `parentRequired`, `checkParent`, `descendsFrom` and `Update` to `internal/holder/store.go`
- [X] T019 [US4] Take `parent_id` as `json.RawMessage` in the PATCH handler so "detach" and "leave alone" stay distinguishable
- [X] T020 [US4] Map `ErrParentRequired`/`ErrParentInvalid` to 422 on `parent_id` in `internal/httpapi/errors.go`
- [X] T021 [P] [US4] Add `ALLOWED_PARENTS`/`PARENT_REQUIRED` to `web/src/lib/types.ts` and rebuild `web/src/routes/Holders.tsx` around them
- [X] T022 [US4] Disable the 部门 option (with a reason) rather than hiding it when no company exists
- [X] T023 [US4] Add `internal/holder/hierarchy_test.go` — six cases: department needs a company, wrong parent kind, location's optional either-parent, company takes none, note round trip, cycle refused
- [X] T024 [US4] Add `web/tests/holderHierarchy.test.tsx` — five DOM cases
- [X] T025 [US4] Add the endpoint cases for the department refusal and the note round trip

---

## Phase 5: User Story 5 — 按持有方筛资产 (Priority: P5)

- [X] T026 [US5] Add the holder select to `web/src/routes/Assets.tsx`, sending `holder_type=entity` alongside the id
- [X] T027 [US5] Add two cases to `web/tests/assets.test.tsx`: the list request carries both params, and so does the export link

---

## Phase 6: 收尾

- [X] T028 Update `specs/001-asset-ledger-demo/contracts/openapi.yaml` in place — the holder paths, the `HolderEntity` schema, the `requires_location` note
- [X] T029 Fix the two i18n-guard violations the new copy introduced (a bare 「或」 in a component; one entry nothing referenced)
- [X] T030 Run the full gate: `go build ./... && go vet ./... && go test ./...`, `npm run typecheck && npm run lint && npm test && npm run build`
- [X] T031 Verify live against a running binary: every hierarchy rule, the note, stock to a department, checkout with an owner, the holder filter, the switch turned back on, and `nexus verify`

---

## Dependencies

```text
Phase 0 ──▶ Phase 2   （先确认坏的是什么，再动手）
Phase 1 ──▶ 其余全部
Phase 2 ──▶ Phase 6
US3/US4/US5 互不依赖，可任意顺序
```

## MVP 范围

**Phase 0 + 1 + 2（US1）** 即可交付：升级后在库设备可以交给任何持有方，
且旧行为随时能勾回来。US2–US5 各自独立，任一阶段停下都不会让系统比现状更差。

## 实现中发现、已修正的三处

1. **报告的原因与实际原因不符**（T001）。位置到位置一直是通的。
2. **`to_status` 背了 `to_holder_id` 的锅**（T009）。字段归属由字符串嗅探决定，
   而那正是这个 bug 的成因。
3. **三处测试夹具与两条断言与新行为脱节**（T010、T027 前置）。
   `/holders` 没有出现在两个测试的 mock 里，返回值落到默认分支变成非数组，
   组件在 `.map` 上崩掉 —— 与 004 那次是同一种失败。
