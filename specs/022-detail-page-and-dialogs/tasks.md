# 任务清单：资产详情整页与对话框改版

**分支**：`022-detail-page-and-dialogs` ｜ **规格**：[spec.md](./spec.md) ｜ **计划**：[plan.md](./plan.md)

**MVP 范围**：US1 + US2（详情是页、历史在同一页）。US3–US5 可独立验收。

**执行顺序是 C → B → A**，与依赖方向相反：验收成本递增，先做能立刻量的。

---

## 第 1 阶段：Setup

- [X] T001 起走查实例，确认跑的是**当前**构建（`npm run build` 后再 `go build`，
  入口 JS 哈希与 `web/dist/static/` 一致）
- [X] T002 [P] 写 `specs/022-detail-page-and-dialogs/contrast.mjs`：
  量破坏性色在页面底/well/card/深色条四处的对比度，不达标退出码 1

---

## 第 2 阶段：Foundational（阻塞后续，先立验收）

- [X] T003 跑 `contrast.mjs` 拿**改造前**读数（现红：浅色三底 4.36/…、深色条 3.48）——
  改完再跑才有对照。改完再写脚本会不自觉地按现状写成永远为真

---

## 第 3 阶段：US5 — 危险动作看得出危险且不刺眼（P2，但先做）

**独立测试**：13 处确认框逐个打开，破坏性与中性形态不同；四处浅色底对比度达标。

- [X] T004 `web/src/index.css`：`--destructive` 换成黏土色；如需要一并定
  `--destructive-foreground`（按钮内文字用暖白，不用纯白）
- [X] T005 跑 `contrast.mjs`：浅色三底必须 ≥4.5:1 且**优于改造前**，不达标就回到 T004
- [X] T006 `features/common/ConfirmDialog.tsx`：加 `tone?: "danger" | "neutral"`，
  **默认 `neutral`**。危险态给危险色主按钮 + 对应图标；中性态用主色按钮、无图标
- [X] T007 [P] `features/metadata/CrudPage.tsx`：`tone` 由已有的
  `RowAction.destructive` 推导 —— **不新增 API**，信息本来就在
- [X] T008 [P] 逐个判定其余 12 处 `ConfirmDialog` 的语气：
  - **危险**：`ActionBar:130`、`AssetDetail:477`、`Assets:873`（删除资产）、
    `CategoryEditor:340`（删类别）、`FieldEditor:368`（删字段）、
    `UserEditor:185`（停用账号）、`SettingsDialog:369`（吊销密钥）
  - **中性**：`Models:437`（保存）、`FieldEditor:389`（重算）、
    `FieldEditor:398`/`:411`（解绑）、`UserEditor:235`（重置密码）
- [X] T009 `features/assets/ActionBar.tsx`：深色药丸上的删除按钮**不用** `--destructive`，
  改为跟随该条已有的反色规则；**注释写明理由**（实测 2.53:1，稿子只覆盖浅色背景，
  这不是疏漏）
- [X] T010 跑 `contrast.mjs`：深色条上的删除按钮必须 ≥4.5:1
- [X] T011 [P] DOM 测试：4 处非破坏性确认框**不呈现**危险形态；
  至少 1 处破坏性确认框呈现危险形态。**先看它红，再让它绿**

---

## 第 4 阶段：US4 — 对话框看起来属于这个产品（P2）

**独立测试**：打开任意对话框逐项核对；外观改动只落在两个共享组件里。

- [X] T012 `components/ui/dialog.tsx`：遮罩改暖色压暗 + 轻微模糊
- [X] T013 `components/ui/dialog.tsx`：面板圆角大于卡片圆角（FR-011）
- [X] T013a **同步更新圆角的成文记录**：`index.css` 的令牌注释与
  `docs/rules/web-tables.md` 的「28 / 20 / 999 三档」都要说明多出来的这一档
  是什么、为什么只给对话框（FR-011a）。
  **仓库明文写着「这是三个名字，不是刻度」——悄悄加第四档，下一个人就无从判断
  文档和代码哪个是对的**
- [X] T014 `components/ui/dialog.tsx`：关闭键改圆形按钮，命中区域 ≥24×24，悬停填 accent
- [X] T015 `components/ui/dialog.tsx`：`DialogFooter` 用负外边距突破容器内边距，
  做成通栏底带（well 色、左对齐、底部两角跟随面板圆角）。
  **容器的内边距不动** —— 动了就要改 20 处调用点
- [X] T016 **装饰层**：放进自己的 `absolute inset-0 overflow-hidden` 容器，
  **绝不给面板加 `overflow-hidden`**（会废掉超高对话框的内部滚动，且不报错）。
  `pointer-events-none`
- [X] T017 `components/ui/alert-dialog.tsx`：同步 T012–T016；装饰色随语气（危险态用黏土色）
- [X] T018 ⚠️ **逐个打开超高对话框滚到底**（`NewAssetDialog`、`SettingsDialog`、
  字段多的类别编辑器），确认末尾控件还在。
  **这是本轮唯一测试与截图都发现不了的问题**（走查第 1 步）
- [X] T019 核对外观改造的改动**只落在两个共享组件文件里**（SC-004）。
  调用点若被改，必须能归因到 T007/T008 的语气工作 —— **不是「这些文件不许动」**，
  那样会与 FR-019 直接打架

---

## 第 5 阶段：US1 — 详情是一页，看完能回到原来的地方（P1）

**独立测试**：带筛选进详情再返回，筛选原样；刷新后返回同样。

- [X] T020 `routes/router.tsx`：`assets/:id` 移出 `assets` 的 children，成为顶层路由；
  删掉 `assets/:id/history`。更新那两段解释为什么嵌套的注释
- [X] T021 `routes/AssetDetail.tsx`：去掉 `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`
  外壳，改成整页；标题区改用页面标题的写法
- [X] T022 `routes/AssetDetail.tsx`：左上角返回控件，目标**恒为** `/assets` 并带回
  当前地址的 search
- [X] T023 `routes/Assets.tsx`：行点击（:668）与行尾按钮（:753）导航时**带上当前 search**；
  扫码精确命中（:310）**不带**
- [X] T024 [P] DOM 测试：带 search 进详情 → 返回 → 目标地址含同一 search；
  无 search 进入 → 返回落到 `/assets`。**先看它红**

---

## 第 6 阶段：US2 — 全部流转就在这一页上（P1）

- [X] T025 `routes/AssetDetail.tsx`：时间线渲染**全部**事件（去掉取最后 5 条的切片）
- [X] T026 `routes/AssetDetail.tsx`：删掉「查看全部流转」按钮
- [X] T027 `routes/Assets.tsx:767`：删掉右键菜单里通往历史页的那一项
- [X] T028 删除 `web/src/routes/AssetHistory.tsx`
- [X] T029 [P] 删 `assets.fullHistory` 文案，**`zh.ts` 与 `en.ts` 同时删**
  （`en.ts` 受 `typeof zh` 约束，只删一边是编译错误）
- [X] T030 [P] DOM 测试：详情页渲染的事件条数等于该设备全部条数；页面上没有通往历史页的入口

---

## 第 7 阶段：US3 — 标题下面只写数据，不写解说（P2）

- [X] T031 `routes/AssetDetail.tsx`：标题下渲染「型号 · 厂商」
- [X] T032 `routes/AssetDetail.tsx`：型号缺失整行不渲染；厂商缺失只渲染型号，
  **不留孤立的分隔点**
- [X] T033 确认标题区没有任何解释字段推导方式的句子
  （`t.assets.generatedSN` 仍留在录入对话框，那里是它该在的地方）
- [X] T034 [P] DOM 测试：有型号有厂商 / 有型号无厂商 / 无型号，三种情形各断言一次

---

## 第 8 阶段：Polish & 跨领域

- [X] T034a 比对改造前后的计算样式：字号、行高、间距、控件尺寸**逐项一致**，
  只有对话框面板圆角允许变化（FR-023 / SC-010）。可复用 021 的窄屏比对脚本思路
- [X] T035 全量前端测试 `--maxWorkers=4`（SC-008）
- [X] T036 [P] ESLint 与 `tsc --noEmit` 零错误
- [X] T037 [P] 服务端零改动：`git diff --stat main -- internal/ cmd/` 为空（SC-007）
- [X] T038 [P] 全仓 grep 无 `fullHistory`、无指向 `/history` 的残留（SC-009）
- [X] T039 `docs/rules/web-tables.md`：改写决策 89 那一条；
  **深色条例外单独留一句**，否则会被当疏漏改回去
- [X] T040 [P] `CLAUDE.md`：决策编号与当前计划指针
- [X] T041 实机走查全部 8 步（[quickstart.md](./quickstart.md)），
  其中顺带核对**没有人加眉标签**（FR-016）
- [X] T042 截图：详情整页（宽屏 + 窄屏）、改版后的对话框、两种语气的确认框、深色批量条
- [X] T043 一次提交，**不推送**

---

## 依赖关系

```
T001 ── 阻塞所有实机验证
T002/T003（验收先立）── 阻塞 T004
T004（换令牌）── 阻塞 T005、T006、T009
T006（tone API）── 阻塞 T007、T008、T011
T012–T017（组件改造）── 阻塞 T018、T019
T020（路由）── 阻塞 T021–T024
T021（去 Dialog 外壳）── 阻塞 T025、T026、T031
T027/T028 ── 阻塞 T038
全部 ── 阻塞 T041、T043
```

**C（US5）与 B（US4）互不依赖**，可并行。
**A（US1/US2/US3）依赖 B 完成**，因为 T021 要先确认对话框改造没有波及详情页
用到的其他对话框（打印、流转、编辑属性）。

## 并行机会

- T007 / T008 / T011 判定与测试互不依赖
- T029 / T030 / T034 三条 DOM 测试互不依赖
- T036 / T037 / T038 / T040 收口项互不依赖

## 独立测试标准

| 用户故事 | 独立验收方式 |
|---|---|
| US1 | 带筛选进详情 → 刷新 → 返回，筛选原样 |
| US2 | 详情页事件条数 = 设备全部条数；无跳转入口 |
| US3 | 三种型号/厂商组合下副标题渲染正确；无解说句 |
| US4 | 任意对话框五项目视核对 + 外观改动只落在两个共享组件 |
| US5 | 13 处确认框语气正确 + 四处对比度达标 |

**建议 MVP**：US1 + US2。它们是本轮的动因，其余三条可后续增量交付。
