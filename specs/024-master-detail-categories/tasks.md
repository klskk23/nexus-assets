# 任务：类别页主从两栏与骨架

**规格**：[spec.md](./spec.md) ｜ **计划**：[plan.md](./plan.md) ｜ **调研**：[research.md](./research.md)

顺序原则：**服务端计数先于一切前端** —— 树上的数字是 P1，而它做错了从界面上看不出来。
测试先于实现的只有两处：计数归并、以及概览与类别页的一致性。其余按「实现完立刻补 DOM 测试」。

---

## Phase 1：服务端计数（US2，P1）

- [X] T001 在 `internal/asset/overview_test.go` 写**归并测试**：三层树，只在叶子放一台设备，断言根/中/叶三处**都是 1**（每层只加一次）
- [X] T002 [P] 在同一文件写**根类别算自己**的测试：根类别直挂两台、子类别一台，断言根为 3
- [X] T003 [P] 写**排除状态**的测试：一台设备处于 `counts_as_available = 0` 的状态，断言各层都不计它
- [X] T004 确认 T001–T003 **红**（`SubtreeCountsByCategory` 尚不存在，应是编译失败而非断言失败）
- [X] T005 在 `internal/asset/overview.go` 实现 `SubtreeCountsByCategory(ctx) (map[string]int, error)`：直挂数按 `AncestorIDs(path)` 加给链上每一个类别。**`AncestorIDs` 已含类别自身，不要再 append 自己**
- [X] T006 把 `Overview()` 的根类别归并改为读 `SubtreeCountsByCategory` 的根条目，**删掉原来那段 `roots[ids[0]].Count += n`**
- [X] T007 写**一致性测试**（FR-007）：同一份数据下，`Overview()` 里某根类别的数与 `SubtreeCountsByCategory()` 里同一 id 的值**互相比较相等** —— 不是各自与常量比
- [X] T008 确认 T001–T003、T007 全绿，且 `go test ./internal/asset/...` 通过

## Phase 2：端点与契约（US2，P1）

- [X] T009 在 `internal/httpapi/server.go` 注册 `authed.GET("/categories/counts", s.categoryCounts)` —— **不加 `need(...)`**，读默认全开放
- [X] T010 在 `internal/httpapi/handlers_categories.go`（或相应文件）实现 `categoryCounts`，返回 `map[string]int`
- [X] T011 **没有设备的类别也要出现且为 0**（契约明写：缺键与 0 在界面上读起来不是一回事）—— 补一条 handler 测试
- [X] T012 [P] 更新 `internal/httpapi/docs/openapi.yaml`
- [X] T013 [P] 更新 `specs/001-asset-ledger-demo/contracts/openapi.yaml` —— **两份合约有测试比对，只改一份是静默漂移**
- [X] T014 [P] 更新 `deploy/smoke.sh`（改了端点就要改）
- [X] T015 跑 `go test ./...`，确认合约比对测试通过

## Phase 3：骨架（US1/US4 的形状，P1）

- [X] T016 新建 `web/src/features/common/MasterDetail.tsx`：两栏栅格（左 300px、右 `minmax(0,1fr)`）、各自滚动、窄屏塌一栏。入参**只有** `selected: boolean`、`list`、`detail`
- [X] T017 新建 `web/src/features/common/useMasterSelection.ts`：给 `ids: string[]` 与当前 `id`，回答当前选中与「未选中时跳哪一条」
- [X] T018 写 `web/tests/masterDetail.test.tsx`：宽屏两栏都在；窄屏未选中只见左栏、选中后只见右栏
- [X] T019 写**骨架纯净性测试**（FR-018）：读 `MasterDetail.tsx` 与 `useMasterSelection.ts` 源码，断言**不含「类别 / category」「树 / tree」「计数 / count」**。源码级不变量，注释里写明为什么（jsdom 看不出「有没有类别专有概念」）
- [X] T019a 同一文件断言**骨架只有一个调用方**（FR-019）：全仓搜 `MasterDetail` 的导入方，恰好一个。本轮禁止为将来预留能力，而「预留」最先表现为第二个调用方悄悄出现

## Phase 4：左栏（US1/US5，P1/P3）

- [X] T020 新建 `web/src/features/categories/CategoryTree.tsx`：复用 `flattenCategories`（`collapsed` 传空数组）与 `searchCategories`
- [X] T021 行是 `Button asChild` 包 `Link to={/categories/:id}`，选中态沿用侧栏导航那一套（`bg-accent` + 半粗）
- [X] T022 每行右端显示子树计数，**0 也要显示**（FR-008）
- [X] T023 左栏顶部搜索用 `Input` 直接画，**不套 `ListToolbar`** —— 它假定自己在表格上方、占满宽度、带筛选插槽
- [X] T023a **搜索词仍要写进地址（`?q=`，`replace`）**。今天由 `useListQuery` 顺带做了这件事；换成 `useState` 会**静默丢掉**它。搜索是客户端过滤（`/categories` 不带 `q`，取全量才建得出树），但词本身归地址
- [X] T023b 写测试：输入搜索词后地址出现 `?q=`；带 `?q=` 直接打开时左栏已是平展命中态
- [X] T024 左栏底部「新建类别」按钮（**不是「新建子类别」**），无权限时禁用 + `deniedReason`
- [X] T025 删除展开/折叠：`CategoryTable.tsx` 的折叠状态与右键菜单里的「展开子类别 / 折叠子类别」两项，连同它们的 i18n 键
- [X] T026 写 `web/tests/categoryTree.test.tsx`：常展开无折叠控件；搜索切平展且显示完整路径；清空恢复成树；无命中有说明

## Phase 5：右栏（US1/US3，P1/P2）

- [X] T027 新建 `web/src/features/categories/CategoryDetail.tsx`
- [X] T028 属性带：上级类别、代号、编号字段、可打印的标签。**上级类别只是文字，不可点**（FR-009）
- [X] T029 「看这个类别的 N 台设备（含子类别）」链接 → `/assets?category_id=…&include_descendants=true`，与概览分布图**同一口径**
- [X] T030 只读字段表（字段 / 键 / 类型 / 必填 / 继承自），保留 `bindElsewhere` 指路文案，**无解绑、无拖拽**（FR-011）
- [X] T031 「修改」按钮开现有 `CategoryEditor`；无 `schema.manage` 时**禁用 + 悬停说明，不隐藏**（FR-015）
- [X] T032 右栏**不放删除**（FR-013）—— 删除留在对话框里
- [X] T033 写 `web/tests/categoryDetail.test.tsx`：字段表列出继承来源；无权限时按钮禁用且有说明；右栏不含破坏性按钮；字段行无解绑控件
- [X] T033a **右栏的三个空态**（规格 Edge Cases 列了但任务漏了，这类漏最后就是一块空白）：一个字段都没绑 → 说明并指路；没有编号字段 → 沿用「未设置（显示 UUID 前 8 位）」既有表述；打印服务离线 → 沿用既有离线表述，不得变成空白或报错
- [X] T033b 三个空态各一条 DOM 断言

## Phase 6：路由与选中（US4，P2）

- [X] T034 `web/src/routes/router.tsx` 加 `categories/:id`，**与 `categories` 同一组件**（不是子路由，见调研三）
- [X] T035 `routes/Categories.tsx` 改用 `MasterDetail` + `CategoryTree` + `CategoryDetail`，退出 `CrudPage` 形状
- [X] T036 未指定类别时**默认显示**第一个根类别，地址不动 —— 原计划是 `<Navigate replace>` 改写地址，实机走查发现那会让窄屏的树永远不可达（不带 id 的地址就是列表页，从它跳走等于每个入口都落在详情上）
- [X] T036a 窄屏详情上加一个 `md:hidden` 的返回入口，指向 `/categories`，与浏览器后退同一去处
- [X] T037 地址指向不存在的类别时给出说明与去处，**不白屏**（FR-022）
- [X] T037a **一个类别都没有**时：左栏空态指向「新建类别」，右栏**不画半页空的详情框架**（规格 Edge Cases）
- [X] T038 删除当前选中的类别后，选中落到确定且存在的地方（FR-024）
- [X] T039 改上级把类别移走后，**选中不丢**（US3 场景 3）
- [X] T039a T037a/T038/T039 各一条 DOM 断言 —— 三条都是「状态变了之后选中去哪」，读代码看不出来
- [X] T040 写 `web/tests/categoriesRoute.test.tsx`：自动选中第一个根类别且是 `replace`；直接打开 `/categories/:id` 命中该类别；不存在的 id 有说明

## Phase 7：一致性验收（US2，P1）

- [X] T041 写**跨页一致性 DOM 测试**：同一份 mock 数据，渲染概览与类别页，断言同一个类别在两处显示**同一个数** —— 读两处的结果互相比较，不是各自比常量
- [X] T042 [P] 补 i18n：新文案进 `zh.ts` 与 `en.ts`；删掉展开/折叠那两条
- [X] T043 [P] 删掉不再使用的 i18n 键与 `CategoryTable.tsx` 的死代码

## Phase 8：文档与门禁

- [X] T044 改写 `docs/rules/web-tables.md` 里「类别页也套用了 `CrudPage` 约定」那一段（FR-027）：**写明这次为什么反过来 —— 不是当初错了，是类别承载的信息变了**
- [X] T045 [P] 在 `docs/rules/` 写下骨架与调用页的分界（FR-028），供第二个调用方参照；写明本轮**故意没做**的三件（左栏宽度参数、空状态插槽、键盘上下键）与为什么
- [X] T046 [P] `docs/rules/web-tables.md` 记下计数口径：**同一个系统只有一种「这类有多少台」**，且概览读的是同一份结果
- [X] T047 服务端门禁：`gofmt -l`、`go vet ./...`、`go test ./...`、`nexus verify` —— **本轮真的要跑，不能以「服务端零改动」略过**
- [X] T048 前端门禁：`npm run build`（含 `tsc -b` 与全部测试）、`npx eslint src tests`、i18n 两份键对齐
- [X] T049 实机走查：常展开树、点选切换、搜索平展、自动选中、直接打开 `/categories/:id`、无权限身份、窄屏一栏
- [X] T050 截图：类别页全貌、搜索平展态、无权限时的禁用按钮、窄屏两态
- [X] T051 **一次提交，不推送**

---

## 依赖

```
Phase 1（计数）──→ Phase 2（端点）──→ Phase 4 的 T022（树上的数字）
Phase 3（骨架）──→ Phase 6（路由与选中）
Phase 4、5 ──────→ Phase 6 ──→ Phase 7 ──→ Phase 8
```

**Phase 3 不依赖 Phase 1/2**，可以并行开工；但 Phase 6 要等骨架与两栏内容都在。

## MVP

**Phase 1 + 2 + 3 + 4 + 6**：树能看、能点、能分享地址、数字正确。
Phase 5 的右栏若只剩属性带也能验收 US1 的一半 —— 但字段表才是本轮的动因，不建议砍。
