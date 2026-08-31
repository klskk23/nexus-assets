---

description: "Task list for 006-bilingual-and-holder-lifecycle"
---

# Tasks: 中英双语与持有方生命周期

**Input**: Design documents from `/specs/006-bilingual-and-holder-lifecycle/`

**Tests**: 测试为**强制**要求（章程原则 II，NON-NEGOTIABLE）：核心管线单元测试、
每个端点的集成测试、**触及 UI 时的 DOM 测试**。不得省略。

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

沿用 001 的结构。新增一个后端包 `internal/i18n` 与一个前端目录 `src/i18n` 的三个文件。

## 顺序

持有方（US3/US4）先做：范围独立、不依赖双语，而双语会触及它新增的文案。

---

## Phase 1: 持有方生命周期 (US3, US4)

- [X] T001 Write `migrations/006_holder_delete.sql` — drop `holder_entities.archived_at`, with a lossy but honest Down
- [X] T002 Extend `internal/store/migrate_test.go` for the post-006 shape and a three-step rollback
- [X] T003 Drop `ArchivedAt` from `model.HolderEntity` and from the holder store's columns and scanner
- [X] T004 Replace `Archive` with `Delete` plus `Usage` in `internal/holder/store.go` — refuse on assets, children and the default stock marker; count history without refusing on it
- [X] T005 Stop skipping archived entities in `internal/importer/resolve.go` — an entity that exists can hold something
- [X] T006 Add `DELETE /holders/:id` and `GET /holders/:id/usage`; make usage 404 on a missing holder rather than返回 all zeros
- [X] T007 Split the refusal payloads in `failHolderDelete` — blockers are moved one at a time, children are a count you deal with in the tree
- [X] T008 Rewrite the three archive tests as delete tests, and add six covering children, history-only and double-counting
- [X] T009 Add the holder delete and usage endpoint tests
- [X] T010 [P] Add the edit dialog and the delete control to `web/src/routes/Holders.tsx`; the type is not editable
- [X] T011 [P] Add five DOM cases: edit, detach a parent, delete armed by typing the name, the cost stated first, the refusal above the table

---

## Phase 2: 服务端双语 (US1)

- [X] T012 Add `internal/i18n` — Lang, Message, Wrap, Text, HasText, Join, Parse, Keys
- [X] T013 Make Message an argument of Message: `In` expands localizable args before Sprintf, so a noun inside a sentence is translated too
- [X] T014 Write the key constants and both catalogues
- [X] T015 Write `internal/i18n/i18n_test.go` — key parity, **argument-slot parity**, unknown key, fallback, sentinel survival, chain walking, Accept-Language
- [X] T016 Migrate `internal/holder` — including the blocker list, whose separator and reason words are themselves copy
- [X] T017 [P] Migrate `internal/schema` — statuses, categories, bindings, refcheck, deps, fields, models
- [X] T018 [P] Migrate `internal/asset` — `FieldErrors` becomes a map of Messages, with `In(lang)` for the envelope
- [X] T019 [P] Migrate `internal/transfer` and `internal/auth`
- [X] T020 Migrate `internal/importer` — Preview/Commit/Columns/Template/Export take a language, because their output is built for one request and does not travel up
- [X] T021 Add `LangOf`, `FailMsg` and `FailField` to `internal/httpapi/errors.go`; `userText` becomes a lookup rather than a prefix strip
- [X] T022 Keep the 400/422 split — `FailField` takes a status, because 400 means the request broke the contract and 422 means the values were wrong
- [X] T023 Empty `internal/httpapi/messages.go` and leave a pointer; deleting the file would lose the path the next reader opens
- [X] T024 Add `internal/httpapi/language_test.go` — refusals, field-level messages and CSV headers in both languages, plus the unsupported-language fallback

---

## Phase 3: 前端双语 (US1, US2)

- [X] T025 Drop `as const` from `web/src/i18n/zh.ts` so `typeof zh` becomes the dictionary's shape
- [X] T026 Write `web/src/i18n/en.ts`, typed against it — a key added on one side and forgotten on the other is a compile error
- [X] T027 Add `web/src/i18n/index.ts` — detectLang, locale, the nine live bindings, applyLang
- [X] T028 Add `web/src/i18n/useLanguage.tsx` — remounts the tree on switch and clears the query cache
- [X] T029 Rename `zh*` to `t*` across 28 files; the old name was misleading once the object meant "the current language"
- [X] T030 Fix the two module-level constants that would freeze at import time (the nav, `transferActions`) — typecheck cannot see these
- [X] T031 Send `Accept-Language` on every request from `web/src/lib/api.ts`
- [X] T032 Add the language toggle to `AppShell`, labelled with the language you would switch to
- [X] T033 Pin the test environment to Chinese in `src/test/setup.ts` — jsdom reports en-US and 190 assertions are written in Chinese
- [X] T034 Rewrite `tests/i18n.test.ts` for two dictionaries: key parity, no Chinese left in en.ts, no dead entries
- [X] T035 Add `tests/language.test.tsx` — switching, persistence, `<html lang>`, cache clearing, and detection

---

## Phase 4: 收尾

- [X] T036 Update `specs/001-asset-ledger-demo/contracts/openapi.yaml` — the two new paths, the Accept-Language parameter, `archived_at` gone
- [X] T037 Update CLAUDE.md: principle V's wording, the holder lifecycle, the module-level-constant trap
- [X] T038 Run the full gate
- [X] T039 Verify live: the same refusal in two languages, field-level messages, CSV headers, holder edit and the four delete refusals, `nexus verify`

---

## Dependencies

```text
Phase 1 ──▶ Phase 2   （双语要翻译持有方新增的文案）
Phase 2 ──▶ Phase 3   （前端切换语言后服务端要跟得上，否则只能验证一半）
```

## MVP 范围

**Phase 1** 独立可交付。**Phase 2 + 3 必须成对交付** —— 只做前端会让英文界面下
弹出中文的拒绝提示，那比不做更糟，因为它看起来像功能已经完成了。

## 实现中发现、已修正的三处

1. **英文目录里一条消息的参数顺序写错了**（T015）。中文是 `(name, total, parts)`，
   英文写成了 `(name, parts, total)`。类型系统看不见；参数槽一致性测试在第一次运行就抓到。
2. **重命名脚本误伤了字符串里的 `zh`**（T029）。`toLocaleString("zh-CN")` 变成了
   `"t-CN"`，运行时抛 `RangeError`。顺带发现日期格式本来就该跟随语言，补了 `locale()`。
3. **`FailField` 一开始把所有字段级失败都写成 422**（T022），
   把两条既有的 400 改掉了。测试抓到 —— 400 与 422 对客户端是两种不同的结论。
