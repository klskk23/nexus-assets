# 实施计划：资产详情整页与对话框改版

**分支**：`022-detail-page-and-dialogs` ｜ **规格**：[spec.md](./spec.md) ｜ **决策**：136–141

## 概要

三块改动，互不阻塞，可分别验收：

| | 内容 | 主要文件 |
|---|---|---|
| **A** | 详情从 dialog 变整页，历史并入 | `router.tsx`、`AssetDetail.tsx`、`Assets.tsx`，删 `AssetHistory.tsx` |
| **B** | 对话框 Organic 化 | `ui/dialog.tsx`、`ui/alert-dialog.tsx` —— **20 处调用点不动** |
| **C** | 破坏性色与确认框语气 | `index.css` 一个令牌、`ConfirmDialog.tsx`、13 处调用逐个判、`ActionBar.tsx` 例外 |

调研（[research.md](./research.md)）定下四个判断，两个是稿子没画到的：

1. 详情的 500 行内容与容器无关，只有三处 dialog 代码要换
2. 历史合并**零成本** —— 两页本来就拉同样两个请求，端点不分页
3. **动作条通栏靠 `DialogFooter` 负外边距突破容器内边距**，不是去掉容器内边距（那要改 20 处）
4. **装饰圆必须放进自己的裁切层** —— 面板加 `overflow-hidden` 会废掉几个对话框的内部滚动，
   而症状是内容被悄悄截断，不是报错

## 技术背景

| | |
|---|---|
| 前端 | React 19 · Vite 6 · Tailwind v4 · shadcn/ui · react-router v7 |
| 服务端 | **一行不动**（SC-007） |
| 令牌 | `--destructive` 一处改动；其余不碰 |
| 文案 | 净减（删 `fullHistory`），无新增 |
| 测试 | 现有 375 例；本轮**新增 DOM 测试**，不登记无测试偏离 |

**没有 NEEDS CLARIFICATION。** 24 条裁定在 `/grill-me` 里逐条决断，开发者看过设计稿与实测数字。

## 章程检查

依据 `.specify/memory/constitution.md` v1.2.0。

| # | 原则 | 符合情况 |
|---|------|----------|
| **I** 代码质量 | 净删一个文件（`AssetHistory.tsx`）、一条路由、一条右键菜单项、一条文案。A 块是搬运不是重写。B 块把二十处的共同形状收进两个组件 —— 这正是原则一要的方向 |
| **II** 测试标准 | 核心管线不动，覆盖率不受影响。**本轮不登记无 DOM 测试的偏离** —— 与 020/021 不同，这一轮的主体是可测行为：返回目标、URL 参数往返、历史条数、`tone` 分支、旧路由消失。纯视觉部分（遮罩、圆角、装饰圆）落在截图与实测对比度上 |
| **III** UX 一致性 | 推翻 014 决策 89，已在规格顶部写明并将改写 `docs/rules/web-tables.md`。表格页七条判断不受影响。**新增一条产品判断**：确认框有语气，默认中性 |
| **IV** 性能要求 | 无新增查询 —— 反而少一个页面发同样的两个请求。全部流转一次渲染，与今日历史页相同，不是新增风险 |
| **V** 语言规范 | 文案**净减一条**，两份目录同步。无新增用户可见文案 |

## Complexity Tracking（章程偏离登记）

| 违反项 | 必需性理由 | 被拒绝的更简方案 |
|---|---|---|
| **「组件必须来自 shadcn/ui。不存在时必须先与开发者确认才能自定义，不接受事后补批」** —— 本轮往 `DialogContent` / `AlertDialogContent` 内部加了一枚纯装饰的形状，这是 shadcn 没有的东西 | **开发者已在 `/grill-me` 中明确点头**（问题「右上角那枚 sage 装饰圆做不做」→「做 — 改进 DialogContent」），是事前确认而非事后补批。它是这套设计语言里「第二嗓音」的出场位置，稿子把它列为对话框改版的六项之一 | **不做装饰圆**：可行且被认真考虑过（选项就摆在开发者面前），被否决。**在每个调用点自己加**：那是二十处重复，且新增对话框会漏 |

**本轮只有这一条偏离。** 原则二不再登记 —— 见上表说明。

## 项目结构

```text
specs/022-detail-page-and-dialogs/
├── spec.md              规格（取代 014 决策 89）
├── plan.md              本文件
├── research.md          Phase 0：四个问题，含两个稿子未覆盖的陷阱
├── quickstart.md        Phase 1：实机走查
└── checklists/
    └── requirements.md  规格质量检查单
```

**没有 `data-model.md` / `contracts/`**：不引入实体、不改端点。

### 源码

```text
web/src/routes/router.tsx              assets/:id 移出子路由；删 assets/:id/history
web/src/routes/AssetDetail.tsx         Dialog 外壳 → 整页；返回按钮；全部流转；副标题
web/src/routes/AssetHistory.tsx        删除
web/src/routes/Assets.tsx              两处导航带上 search；删右键「查看全部历史」
web/src/i18n/{zh,en}.ts                删 assets.fullHistory
web/src/components/ui/dialog.tsx       遮罩、圆角、关闭键、Footer 通栏底带、装饰层
web/src/components/ui/alert-dialog.tsx 同上 + 危险态装饰色
web/src/features/common/ConfirmDialog.tsx  加 tone
web/src/index.css                      --destructive → 黏土色
web/src/features/assets/ActionBar.tsx  深色条上的删除按钮改反色（FR-020 例外）
+ 12 处 ConfirmDialog 调用逐个判 tone
docs/rules/web-tables.md               改写决策 89 那一条
```

## 阶段

### 第 0 阶段：调研 ✅
见 [research.md](./research.md)。

### 第 1 阶段：设计 ✅
[quickstart.md](./quickstart.md) —— 实机走查。

### 第 2 阶段：实施顺序

**C 先于 B，B 先于 A** —— 与依赖方向相反，因为验收成本递增：

```
C1 换 --destructive 令牌 → 立刻能量对比度，四个底色全过才继续
C2 ConfirmDialog 加 tone（默认中性）→ 13 处逐个判 → DOM 测试守 4 处中性
C3 ActionBar 深色条例外 + 代码注释写明理由
   ↓
B1 dialog.tsx：遮罩、圆角、关闭键
B2 DialogFooter 负外边距通栏底带  ← 先确认 20 处调用点零改动
B3 装饰层（自己的裁切容器，不动面板 overflow）← 先确认超高对话框仍能滚
   ↓
A1 路由表：详情移出子路由，删历史路由
A2 AssetDetail 去 Dialog 外壳 → 整页 + 返回按钮 + 副标题
A3 全部流转（去掉 slice 与跳转按钮）
A4 Assets.tsx 两处导航带 search；删右键项
A5 删 AssetHistory.tsx + fullHistory 文案（两份目录）
   ↓
DOM 测试（返回目标、search 往返、全部条数、tone 分支、旧路由消失）
   ↓
文档：web-tables.md 决策 89 改写、CLAUDE.md 编号与计划指针
```

**B3 之前必须先验证超高对话框仍能滚动** —— 那是 research 问题四指出的陷阱，
它的症状是内容被悄悄截断，测试与截图都不会自动发现。

## 风险

| 风险 | 应对 |
|---|---|
| **面板 `overflow-hidden` 废掉内部滚动，且看不出来** | 装饰放独立裁切层；B3 之后逐个打开超高对话框（`NewAssetDialog`、`SettingsDialog`）滚到底确认末尾内容还在 |
| **`DialogFooter` 负外边距在没有 footer 的对话框上留下痕迹** | 只改 `DialogFooter` 组件本身；不用它的对话框不受影响。走查逐个看 |
| **20 处调用点被无意改动** | SC-004 以 `git diff --stat` 为准，收口时逐个核 |
| **13 处 tone 判错，「保存」弹垃圾桶** | 4 处非破坏性写进 DOM 测试，判错会红 |
| **深色条例外被后人当疏漏改回去** | 规格 FR-020 + 代码注释双写理由，并在 `web-tables.md` 留一句 |
| **详情页返回丢筛选** | SC-001 覆盖三种情形（直接返回、刷新后返回、无筛选入口）；DOM 测试守往返 |
| **旧历史地址残留链接** | SC-009 全仓 grep |
| **半成品被误发布** | 017–021 的 52 个提交仍未推，022 在其上继续；不打 tag、不合 main、不推送 |
