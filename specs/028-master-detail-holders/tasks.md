---

description: "Task list for 028 — 持有方主从化，四页拉齐"
---

# Tasks: 持有方主从化，四个主从页拉齐

**Input**: Design documents from `/specs/028-master-detail-holders/`

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ ✅

**Tests**: 强制（章程原则 II）。服务端每个新端点要集成测试（真实 SQLite 临时库）；
触及 UI 必须有 DOM 测试。**本轮至少两处要红→绿双向验**：计数一致性、权限禁用。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可并行（不同文件、无未完成依赖）
- **[Story]**：US1–US5，对应 spec 的五个故事

---

## Phase 1: Setup

- [ ] T001 造走查数据的脚本，写到 `specs/028-master-detail-holders/quickstart.md` 已描述的形状：
      一棵三层树 + 一个 0 台的节点 + 一台报废设备 + 触发两个阈值的规模。
      放 `scripts/` 之外的临时位置，**不进仓库**（演示库是 `/tmp` 上的副本）。

---

## Phase 2: Foundational（阻塞所有故事）

**服务端的两条读法。前端的一切都依赖它们，且它们之间必须可比对。**

- [ ] T002 `internal/asset/overview.go`：新增 `SubtreeCountsByHolder(ctx) (map[string]int, error)`。
      递归 CTE 沿 `holder_entities.parent_id` 展开，`LEFT JOIN assets`
      （`holder_type = 'entity'`），`GROUP BY` 根。**不按状态过滤**，每个持有方都有键、空的写 0。
      注释写明：为什么不加 `path` 列、为什么口径与 `subtreeCounts` 故意不同。
- [ ] T003 `internal/asset/query.go`：`ListFilter` 增加 `IncludeHolderDescendants bool`；
      `plainFilters` 里的持有方分支改为按开关走两条路 —— 为假走现有的
      `holder_type = ? AND holder_id = ?`，为真走同一棵递归 CTE 的子查询。
- [ ] T004 [P] `internal/httpapi/handlers_holders.go`：新增 `GET /holders/counts` 处理器；
      `internal/httpapi/routes.go` 挂上。读默认全开放，与 `/categories/counts` 一致。
- [ ] T005 [P] `internal/httpapi/handlers_assets.go`：读 `holder_include_descendants`，
      **默认 false**（与类别的 `include_descendants` 默认 true 故意不同，注释写明理由）。
- [ ] T006 读同一套筛选的另外三处（`handlers_importexport.go`、`handlers_rows.go`、
      `handlers_print.go`）**保持默认 false**，本轮不支持新参数 —— 它们回答的都是
      「就这一批」（导出这一批、打印这一批、取这一批的行），含下级会让一次导出
      悄悄多出几百行。**在这三处各留一行注释写明这是决定而非遗漏**；
      026 的教训是「一处改了契约、另几处没跟上，而 mock 把测试变成绿的」。

### Foundational 的测试（与实现同一批，不后置）

- [ ] T007 `internal/asset/overview_test.go`：`TestHolderSubtreeCounts` —— 三层树，
      含一个 0 台的节点，断言根的数字是子树合计而非它自己直接持有的。
- [ ] T008 `internal/asset/overview_test.go`：`TestHolderCountsIncludeRetired` ——
      同一台报废设备，持有方计数**含它**、类别计数**不含它**。
      **红→绿双向验**：把状态过滤加回持有方那条，这条必须红。
- [ ] T009 `internal/httpapi/holders_counts_test.go`：
      **`TestHolderCountsAgreeWithTheFilteredList`** —— 对夹具里的**每一个**持有方，
      断言 `GET /holders/counts` 的值 == `GET /assets?holder_id=…&holder_include_descendants=true`
      的 `total`。这是 SC-002 在服务端的落点，也是钉住两处 SQL 的唯一手段。
- [ ] T010 [P] `internal/httpapi/holders_counts_test.go`：
      `TestAssetsHolderFilterDefaultsToThatHolderAlone` —— 不带参数时行为与今天一致
      （既有链接不能被静默改变含义）。
- [ ] T011 [P] 合约：`internal/httpapi/docs/openapi.yaml` 加 `/holders/counts` 与
      `holder_include_descendants`；`cp` 到 `specs/001-asset-ledger-demo/contracts/openapi.yaml`；
      跑 `TestEmbeddedContractMatchesTheSpec`。

**Checkpoint**：服务端可独立验收 —— 计数与筛选对每一个持有方都相等。

---

## Phase 3: US1 — 看清持有方的层级（P1）

- [ ] T012 [P] [US1] `web/src/lib/types.ts`：`HolderEntity` 无需改动，确认即可；
      若缺 `is_default_stock` 之类的字段则补齐类型。
- [ ] T013 [US1] `web/src/features/holders/holderRows.ts`：`flattenHolders`（深度优先、
      带 `isFolded`）、`searchHolders`（平展 + 沿 `parent_id` 爬出完整路径，**带界**）、
      `rootIDOf`（沿 `parent_id` 爬到根，**带界**；类别那份读物化路径，这份不能照抄）。
      **根排序按名字，类型不参与**（FR-004）。
- [ ] T014 [US1] `web/src/features/holders/HolderTree.tsx`：`Rail` + `RailRow` + `TreePager`
      + `useFoldable` + `rootPaging`。行上带类型标识与设备数；底部「新建持有方」按钮
      （无 `holder.create` 时禁用 + 悬停说明）。**零新组件**。
- [ ] T015 [US1] `web/src/features/holders/HolderDetail.tsx`：属性带（类型 / 上级**不可点** /
      默认库存点）+ **备注单独一块** + 「看这里的 N 台设备」链接 + 「修改」按钮。
      US3 的按钮在 T022 加进来。
- [ ] T016 [US1] `web/src/features/holders/HolderEditor.tsx`：把 `Holders.tsx` 里的
      `EditDialog` 与删除、`RefusalAlert` 搬进来，**合并成一条拒绝路径**（两个 refusal 状态
      变一个，因为删除与保存都在同一个对话框里了）。
- [ ] T017 [US1] `web/src/routes/Holders.tsx` 重写：`MasterDetail` + `useMasterSelection`
      （**传全部持有方的 id，不是本页的**）+ `PageHeader`。不再 import `CrudPage`。
- [ ] T018 [US1] `web/src/routes/router.tsx`：加 `holders/:id`，与 `holders` 同一组件。
- [ ] T019 [US1] i18n 两种语言：新增 plan 里列出的十一条；**删除**
      `holders.filterType` / `holders.filterStock` 两个孤儿。

### US1 的测试

- [ ] T020 [US1] `web/tests/holdersTree.test.tsx`：层级正确（公司与无上级的位置并排在根）、
      根按名字排序、点节点写地址、刷新保持、**陈旧 id 与空列表是两句不同的话**、
      搜索平展且带完整路径、**备注可见（SC-007，025 删过一次的那条）**、
      树上无右键菜单、窄屏返回入口、**行上标出类型**（FR-003）、
      **属性带里的上级不是链接**（FR-016，024 决策 8）、
      **无 `holder.create` 时新建按钮禁用并说出缺什么**（FR-009）。
- [ ] T020a [US1] `web/tests/holdersTree.test.tsx`：**左栏的分页与折叠**（FR-005、FR-006）。
      根多于一页时，翻到第二页后**任何一行的父都在同一页上**（014 决策 91 的守卫）；
      单节点子项超阈值时默认折起并在行上写明数量，点一下展开。
      **这条不能漏**：本轮 research 的第一节正是「功能在、守卫不在」的现场，
      在同一轮里给类别补上守卫却不给持有方补，是把同一个坑挖第二遍。
- [ ] T021 [US1] 改写 `web/tests/holderHierarchy.test.tsx`：表格断言换成树与对话框断言。
      **不要删掉任何一条既有断言就换掉它** —— 025 就是在改写测试文件时把功能与守卫
      一起删掉的。逐条对照：每条旧断言要么迁移，要么在这里写下为什么不再适用。

**Checkpoint**：US1 可独立验收 —— 树画出来了，选中写进地址。

---

## Phase 4: US2 — 一眼知道每处放着多少台（P1）

- [ ] T022 [US2] `web/src/routes/Holders.tsx`：接上 `/holders/counts` 查询，
      喂给 `HolderTree` 的行尾与 `HolderDetail` 的链接。**同一个 map，两处读**——
      不是「两个各自算」（024 那条规矩的形状）。
- [ ] T023 [US2] `HolderDetail` 的链接带 `holder_id=…&holder_include_descendants=true`。
- [ ] T024 [US2] `web/src/routes/Assets.tsx`：确认从链接进来时 `holder_include_descendants`
      被读进筛选态并回传给服务端；不读的话数字与行数就对不上（026 的教训：
      **前端没跟上契约，而 mock 编码了旧契约所以测试全绿**）。

### US2 的测试

- [ ] T025 [US2] `web/tests/holdersCountAgreement.test.tsx`：**行尾的数 == 链接文案里的数**，
      且链接的 query 串**恰好**是 `holder_id=<id>&holder_include_descendants=true`。
      两个数互相比对，不是各自比对常量（照 `categoryCounts.test.tsx` 的写法：
      「两个都断言 41 的测试，在两条路径开始分歧的那天会一起保持绿色」）。
- [ ] T026 [P] [US2] `web/tests/holdersCountAgreement.test.tsx`：0 也写出来，不留白。
- [ ] T027 [US2] 走查（quickstart 第 1、2 节）：根/中间层/叶子各验一次三者相等；
      确认两种口径的数**不在同一屏上顶着同一个词**。

**Checkpoint**：US2 可独立验收 —— SC-002 成立。

---

## Phase 5: US3 — 找到并设置默认库存点（P2）

- [ ] T028 [US3] `web/src/routes/Holders.tsx`：页头一行「默认库存点：X」，
      **点击选中它并在必要时翻到它所在那一页**（分页之后这是它存在的理由）。
      没有默认库存点时页头说明这一点（归还会因此失败）。
- [ ] T029 [US3] `HolderDetail.tsx`：独立的「设为默认库存点」按钮，
      按 `holder.default_stock` **单独**判断禁用；已是默认时禁用并说明
      「换一个即可移走这个标记」。**注释写明这是 024 决策 12「右栏只读」的明确例外及理由**——
      下一个人会拿它和 `CategoryDetail` 比。
- [ ] T030 [US3] `HolderEditor.tsx`：编辑对话框里的 `is_default_stock` 勾选框**去掉**
      （入口只剩右栏那一个，两个权限不再共用一个入口）。

### US3 的测试

- [ ] T031 [US3] `web/tests/holdersDefaultStock.test.tsx`：页头那行存在且可点、
      设置后标记移走、**只有 `holder.update` 时按钮禁用并说出缺哪个权限**（红→绿双向验）、
      已是默认时禁用并给出那句说明、没有默认库存点时页头的提示。
- [ ] T032 [P] [US3] 同文件：确认编辑对话框里**不再有**那个勾选框
      （改写 `holderHierarchy.test.tsx` 里「is set in the editor」那条时，
      要写明它为什么不再适用，而不是静静删掉）。

---

## Phase 6: US4 — 删除与代价（P2）

- [ ] T033 [US4] `web/src/routes/Holders.tsx`：**删掉那个 `Promise.all` 的 usage 预取**。
- [ ] T034 [US4] `HolderEditor.tsx`：打开删除确认时才查 `/holders/{id}/usage`，
      用它填确认框的描述（有多少条流转历史提到它）。
- [ ] T035 [US4] 服务端拒绝时的 blockers 列在同一个对话框里（`RefusalAlert` 只剩一处落点）。

### US4 的测试

- [ ] T036 [US4] `web/tests/holdersTree.test.tsx` 或独立文件：打开页面时**不发出**
      逐行的 usage 请求（断言请求列表，不是断言渲染）；点删除时**才**发出一次。
- [ ] T037 [P] [US4] 拒绝时阻挡项显示在对话框内；确认框在删除前说明流转历史条数。

---

## Phase 7: US5 — 类别页（P3，**证明而非实现**）

> research 第一节：分页与折叠 025 就接上了，演示数据碰不到阈值所以没人见过。
> 这一阶段是补守卫与校正记录。

- [ ] T038 [US5] `web/tests/categories.test.tsx`：补**根分页**一条 ——
      造多于一页的根，断言翻页后**任何一行的父都在同一页上**（014 决策 91 的守卫）。
- [ ] T039 [US5] `web/src/features/categories/CategoryTree.tsx`：改掉顶部注释里
      「No folding, and no chevrons to fold with」那段 —— 它下面 30 行就在渲染 chevron。
      写成 025 的条件式折叠理由。
- [ ] T040 [US5] `docs/rules/web-tables.md`：改写 024 决策 152 那段
      （「**不折叠。**…`CollapsibleTree` 当初就是这么被删的」），写明**为什么反过来**：
      不是原来判错了，是当初缺的那块零件（`rootPaging` 的按根分页、
      `useFoldable` 的条件式折叠 + 行上写明数量）后来做出来了。
- [ ] T041 [P] [US5] 同文件：同段里「未指定类别时 `<Navigate replace>` 到第一个根类别」
      也已陈旧 —— 024 走查后改成了「默认显示第一条、地址不动」（`useMasterSelection`）。
      一并校正。

---

## Phase 8: Polish & 门禁

- [ ] T042 `docs/rules/domain.md`：写入**两种「有多少台」**——
      类别问「有多少台能用的」，持有方问「这里放着多少台」；
      **两个数不得在同一屏上顶着同一个词出现**（FR-015）。
- [ ] T043 `docs/rules/web-tables.md`：写入持有方页的形状（第四个主从页）、
      右栏那处「只读看板」的例外及理由、以及**两处 SQL 靠一条比对测试钉住**这件事。
- [ ] T044 [P] `web/src/features/metadata/CrudPage.tsx` 的使用者清单是否需要更新；
      `masterDetail.test.tsx` 里「调用方就是这三页」的守卫改成四页。
- [ ] T045 **FR-035 检查**：确认 `MasterDetail` / `useMasterSelection` 本轮零改动。
      若被迫改了，**在交付说明里报告是什么迫使它改变**，不要顺手改掉了事。
- [ ] T046 门禁全跑：`gofmt -l internal cmd`、`go vet ./...`、`go test ./...`、
      **`go test -cover ./internal/asset/ ./internal/holder/ ./internal/httpapi/` 并记下数字
      （SC-008 要求核心管线 ≥80%）**、`cd web && npx vitest run --maxWorkers=4`、
      `npm run build`、`npm run lint`、真实库副本上 `nexus verify`。
- [ ] T047 实机走查：按 `quickstart.md` 十节全走一遍，**含第 9 节**
      （若类别页的分页与折叠走查不出来，research 第一节的结论就是错的，回去重查）。

---

## Dependencies

```
Phase 2（服务端）
   ├── US1（树）──────┬── US2（计数）── US3（默认库存点）
   │                  └── US4（删除与 N+1）
   └── US5（类别页）  ← 与其余无依赖，可任意时候做
Phase 8 在全部之后
```

- **US5 完全独立**，不依赖服务端，可以并行插入任何位置。
- **US2 依赖 US1**（要有树才有行尾）与 Phase 2（要有端点）。
- **US3 依赖 US1**（要有右栏）。
- **US4 依赖 US1**（编辑对话框已经搬出来）。

## MVP

**Phase 2 + US1**：持有方页变成一棵能点、能选中、能编辑的树。
计数、默认库存点入口、N+1 都可以后续增量交付。

## 并行机会

- T004 与 T005（不同处理器文件）
- T010 与 T011（测试与合约）
- T012 与 T013 起步阶段
- T026、T032、T037、T041、T044 各自标了 [P]
- **US5 整段**可与 Phase 2–7 并行

## 每个故事的独立验收

| 故事 | 怎么单独验 |
|---|---|
| US1 | 造三层树 → 左栏画出层级，点节点地址变，刷新保持 |
| US2 | 根/中间层/叶子各一次：行尾的数 == 链接文案里的数 == 列表行数 |
| US3 | 只有 `holder.update` 的账号 → 按钮禁用且**不发请求就能看出来** |
| US4 | 网络面板：打开页面无逐行 usage；点删除才出现一次 |
| US5 | 造 13 个子类别 → 默认折起并写明数量；造 13 个根 → 出现翻页条 |
