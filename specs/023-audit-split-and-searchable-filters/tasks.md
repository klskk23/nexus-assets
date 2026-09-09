# 任务清单：审计分栏、流转可查、筛选可搜

**分支**：`023-audit-split-and-searchable-filters` ｜ **规格**：[spec.md](./spec.md) ｜ **计划**：[plan.md](./plan.md)

**MVP**：US1 + US2（流转可查 + 权限拆分不丢能力）。US3、US4 可独立增量交付。

**顺序 A → B → C → D，E 独立**。A 里**测试先于迁移**：迁移做错无法靠事后观察发现。

---

## 第 1 阶段：Setup

- [X] T001 复制一份升级前的库留作迁移对照（`cp /tmp/qs018.db /tmp/mig.db`），
  记下升级前各角色的 `permissions`
- [X] T002 [P] 确认走查实例跑的是当前构建（`npm run build` 后再 `go build`，入口 JS 哈希一致）

---

## 第 2 阶段：Foundational —— 验收先立

**迁移正确与否无法事后观察**：等有人报「我看不到审计了」，数据已经迁完。

- [X] T003 写迁移测试：造一个只带 `audit.read` 的角色 → 跑迁移 → 断言两个权限都在；
  再造一个不带的 → 断言一个都没多。**先看它红**
- [X] T004 [P] 写「权限登记处齐全」测试：断言新权限同时出现在
  `authz.All`、`httpapi` 名称表、前端 `PERMISSIONS`、两份前端 i18n。
  **第三处漏掉是静默失败**，没有编译错误也没有别的测试会报

---

## 第 3 阶段：US2 — 拆权限且不丢能力（P1）

**独立测试**：升级前只带审计权限的角色，升级后两栏皆可见。

- [X] T005 `internal/authz/permissions.go`：加 `TransferAudit` 常量，并加进 `All`
- [X] T006 `internal/i18n/keys.go` + `catalog.go`：加 `KeyPermTransferAudit` 与两种语言
- [X] T007 `internal/httpapi/permissions.go`：名称表加一行
- [X] T008 [P] `web/src/features/auth/usePermissions.ts`：`PERMISSIONS` 加一项
- [X] T009 [P] `web/src/i18n/{zh,en}.ts`：`perm.names` 各加一条
- [X] T010 `migrations/019_transfer_audit_permission.sql`：给含 `audit.read` 的角色
  追加新权限；用 `NOT EXISTS` 保证**可重复执行**；写 Down
- [X] T011 新建角色默认带流转审计（FR-003）。**定在服务端**的角色创建默认权限集里，
  不是界面上的一个预勾选 —— 否则通过 API 建的角色和通过界面建的不一样
- [X] T012 跑 T003/T004 —— 必须由红转绿
- [X] T013 更正 `CLAUDE.md`：加权限**实际要动六处**不是四处，
  并写明**只有前端 `PERMISSIONS` 那处是静默失败**，其余五处会由编译或既有测试抓住

---

## 第 4 阶段：厂商权限改归属（P1，与 US2 同批）

- [X] T014 `internal/httpapi/server.go`：厂商的 POST/PATCH/DELETE 改守 `ModelManage`；
  **`/vendors/:id/bindings` 两条不动**，仍守 `SchemaManage`
- [X] T015 [P] 服务端测试：带 `model.manage` 能建厂商、不能给厂商绑字段；
  带 `schema.manage` 反之
- [X] T016 [P] `docs/rules/schema.md`：改写 016 FR-027 那条，写明**为什么只转一半**
  （给厂商绑字段会让旗下全部型号继承，那是结构改动；建个名字不是）

---

## 第 5 阶段：US1 — 流转可查（P1）

**独立测试**：造多台设备的流转，四个筛选逐个与叠加，条数与内容正确。

- [X] T017 `Transfer` 带 `asset_display_name`：读取时解析，**每页一次**
  （照搬 `internal/asset/query.go` 的 display_key 表做法，不要每行一次）
- [X] T018 **逐处**带上它（FR-016）—— 「所有地方」必须写成名单，否则一定漏一处：
  1. `GET /assets/:id/transfers` 2. `GET /overview` 的 `recent_transfers`
  3. `POST /transfers` 的响应 4. `PATCH /transfers/:id` 5. 新的 `GET /transfers`
- [X] T018a [P] 测试遍历上面五处，断言每处返回的流转都带可读标识
- [X] T019 `internal/transfer/query.go`（新）：列表查询，时间倒序、分页、返回信封
- [X] T020 筛选：操作人（等值）、时间范围、动作类型
- [X] T021 资产编号筛选：**落在 SQL**，走
  `asset_id IN (SELECT asset_id FROM asset_unique_values WHERE value LIKE ?) OR asset_id LIKE ?`
  —— 与资产列表搜索同一形状。**不要取回后在 Go 里过滤再分页**
- [X] T022 [P] 服务端测试：四个筛选逐个 + 叠加 + **零结果** + **跨分页边界**；
  编号匹配的**大小写不同**与**片段在中部**（FR-011/FR-012、SC-003/SC-004）。
  测试数据里**造一台所属类别没有编号字段的设备**，它的编号退化成短标识 ——
  筛选与显示两侧都要对（SC-005）
- [X] T023 `GET /transfers` 守 `transfer.audit`
- [X] T024 [P] 服务端测试：只有 `audit.read` 的账号访问该端点被拒
- [X] T025 [P] `deploy/smoke.sh` 与 `specs/001-*/contracts/openapi.yaml` 同步新端点

---

## 第 6 阶段：US1/US2 的界面 — 审计分两栏（P1）

- [X] T026 `MetadataTabs` 加 `audit` 组：`/audit` 与 `/audit/transfers`
- [X] T027 `routes/TransferAudit.tsx`（新）：表格 + 四个筛选 + 分页，筛选进地址栏
- [X] T028 `router.tsx` 加路由；`Audit.tsx` 挂上页签
- [X] T029 只有一种权限时**落到有权的那一栏**，另一页签不出现；
  侧栏入口有任一权限即显示
- [X] T030 [P] DOM 测试：三种权限组合各断言一次（只操作审计 / 只流转审计 / 都没有）
- [X] T031 [P] DOM 测试：四个筛选写进地址栏并可回读

---

## 第 7 阶段：US3 — 两张流转表（P2）

- [X] T032 `routes/Overview.tsx`：最近流转改 `TableFrame` 表格，
  列 = 时间 ｜ **资产** ｜ 变更内容 ｜ 操作人
- [X] T033 `routes/AssetDetail.tsx`：流转历史改表格，
  列 = 时间 ｜ 变更内容 ｜ 操作人（**不含资产列**）
- [X] T034 更正入口改 `ContextMenu`；不可更正的行该项**禁用而非隐藏**
- [X] T035 `Timeline` 的去留：T032 与 T033 之后它的**使用者归零**，随之删除。
  **连带**：`assetDetail.test.tsx` 有一条断言 `role="list"` 且名为 `tTransfer.timeline`
  的测试（022 写的），表格里没有 `list`，那条必须一并改；
  `tTransfer.timeline` 若因此成为孤儿文案，两份目录一起删
- [X] T036 [P] DOM 测试：概览每行含资产标识；详情页没有任何一列重复本页编号；
  右键出更正、不可更正时禁用

---

## 第 8 阶段：US4 — 可搜筛选（P2）

- [X] T037 加 `cmdk` 依赖 + `components/ui/command.tsx`（shadcn 原样）
- [X] T038 `features/common/SearchSelect.tsx`（新）：Popover + Command 的可搜下拉，
  统一空态；**不改 `Select`**，两者并存（候选少的继续用 `Select`）
- [X] T039 [P] 替换四处：厂商、型号、持有方/负责人、类别
- [X] T040 类别在搜索状态下显示**完整路径**（「网络设备 / SDWAN 路由器」），
  按类别页先例，不显示缩进
- [X] T041 [P] DOM 测试：片段在中部、大小写不一致均命中；无命中有空态；
  **纯键盘全流程**（打开 → 输入 → ↑↓ → Enter）
- [X] T042 [P] `docs/rules/web-tables.md`：写下判据 ——
  **候选多的下拉可搜，候选少的继续用 `Select`**，并写明不在 `Select` 里塞输入框的原因
  （Radix 的 typeahead 会抢按键）

---

## 第 9 阶段：Polish & 门禁（本轮服务端真的要跑）

- [X] T043 `gofmt -l .` 输出为空；`go vet ./...` 与 `golangci-lint run` 零告警
- [X] T044 `go test ./...` 全过；核心管线覆盖率不低于既有水平
- [X] T045 `nexus verify` 对种子库对帐通过
- [X] T046 **迁移在真实旧库上走一遍**（quickstart 第 1 步）：
  升级前带 `audit.read` 的两个都有、不带的一个没多、`role-admin` 的 `[]` 未被碰、
  **再跑一次不产生重复**
- [X] T046a [P] 文案两语言同步（FR-026）：**不只是权限名** —— 页签名、四个筛选标签、
  两处空态、新表头都要在两份目录里，跑 i18n 的孤儿/缺失测试核对
- [X] T047 [P] 前端：`npm test --maxWorkers=4`、`npm run build`（含 tests 的 `tsc -b`）、`npm run lint`
- [X] T048 [P] `docs/rules/{web-tables,auth}.md`：审计两栏与两种权限
- [X] T049 [P] `CLAUDE.md` 决策编号与计划指针（计划指针已在 plan 阶段更新）
- [X] T050 实机走查全部 9 步（[quickstart.md](./quickstart.md)），
  其中第 6 步（纯键盘）**四个下拉每个都要走一遍**
- [X] T051 截图：流转审计、两张流转表、可搜下拉展开态
- [X] T052 一次提交，**不推送**

---

## 依赖关系

```
T003/T004（验收先立）── 阻塞 T005–T012
T005–T009（六个登记处）── 阻塞 T010（迁移）
T017（编号解析）── 阻塞 T019–T021
T019–T021（查询）── 阻塞 T023（端点）── 阻塞 T027（界面）
T026（页签）── 阻塞 T029
T032/T033 ── 阻塞 T035（Timeline 去留）
T037（依赖与组件）── 阻塞 T038 ── 阻塞 T039/T040
全部 ── 阻塞 T043–T052
```

**E（可搜筛选）与 A–D 无依赖**，可并行。

## 并行机会

- T008/T009 前端两处登记；T015/T016 厂商测试与文档
- T022/T024 两组服务端测试；T030/T031 两组 DOM 测试
- T036/T041 两组 DOM 测试；T043–T049 收口项

## 独立测试标准

| 用户故事 | 独立验收 |
|---|---|
| US1 | 四个筛选逐个与叠加，含零结果与跨页；只有 `audit.read` 的账号被服务端拒 |
| US2 | 真实旧库迁移后，原带审计权限的角色两栏皆可见；三种权限组合各自正确 |
| US3 | 概览每行可见资产；详情页无重复列；更正在右键且不可更正时禁用 |
| US4 | 四个下拉各自纯键盘走通；中部片段与大小写不一致均命中 |
