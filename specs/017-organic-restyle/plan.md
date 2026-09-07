# 实施计划：Organic 风格前端重构

**分支**：`017-organic-restyle` ｜ **规格**：[spec.md](./spec.md) ｜ **决策**：114–121

## 概要

前端换成 Organic 设计语言，资产页重建选择与批量模型，深色下架，字体自托管。
**不改任何领域规则，不写迁移，服务端只有一处可能触及**（见下）。

调研（[research.md](./research.md)）的三个结论把这一轮从「重写前端」缩成了
「换 token + 改一批类名 + 重做一个页面的选择模型」：

1. `index.css` 已经是语义 token 层，换十九个变量的值 = 全站配色到位，组件类名不动
2. 深色的移除面封闭：`features/` 与 `routes/` 里**零处** `dark:`，全靠 token 层实现
3. 「选中符合筛选的全部 N 条」不需要新端点，`ListResult` 已返回 `total`

唯一的真风险是**中文字体的分发体积**，它有预留的翻案点。

## 技术背景

沿用既有技术栈。**依赖净变动是 −1 +3**：移除 `next-themes`（只有 `ui/sonner.tsx` 用到），
加入三个 `@fontsource` 包。

**这与本文件原先写的「字体是静态资产不是依赖」相反，改法有理由。**
原计划要把 woff2 落进 `web/src/assets/fonts/`。落地时才知道那是 **210 个文件、7 MB** ——
unicode-range 分片本来就是上百个小文件。把它们提交进仓库，等于给一个 23 MB 的仓库
永久增加 7 MB 历史，而三条构建路径（`Makefile`、`ci.yml`、`deploy/Dockerfile`）
**本来就都跑 `npm ci`**，包取回来后由 Vite 发到 `dist/`、再随 `embed.FS` 进二进制 ——
字节数、落点、离线可用性完全一样，只是不进 git。
开发者的决策 6 说的是「全自托管、不得依赖 Google Fonts」，这一点没有变：
产物里没有任何指向 `fonts.googleapis.com` 的引用。

| | |
|---|---|
| 前端 | React 19 · Vite 6 · Tailwind v4 · shadcn/ui（保留）· TanStack Query v5 · react-router v7 |
| 服务端 | 不变。`users.theme` 字段保留、不写迁移 |
| 测试 | Vitest 3 + RTL + jsdom；现有 360 例、700 处 `getByRole` 断言 |
| 迁移号 | **无**。本轮不碰数据库 |
| 新增依赖 | `@fontsource/caprasimo`、`@fontsource-variable/figtree`、`@fontsource/noto-sans-sc`（见下） |
| 新增资产 | 三份 OFL LICENSE 进 `web/public/fonts/`，随产物分发 |

**没有 NEEDS CLARIFICATION。** 八个设计分支在访谈里逐个表决过，
三条推定项写在 spec 的 Assumptions 里。

## 章程检查

依据 `.specify/memory/constitution.md` v1.2.0。逐条填写：

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| **I** 代码质量 | 分层边界不动：本轮不触及 `internal/`，唯一的服务端相关动作是**不动** `users.theme`。前端的分层保持现状（`components/ui` 是形状层，`features/` 是行为层，`routes/` 是页面）。**依赖 −1 +3**：移除 `next-themes`，加入三个 `@fontsource` 包（理由见「技术背景」）。三者都是纯静态资产包，无运行时代码、无传递依赖、无安装脚本 |
| **II** 测试标准 | 核心管线（`internal/schema`、`internal/asset`、`internal/compute`）**一行不改**，覆盖率不受影响。**触及 UI 必须列 DOM 测试**：资产页的选择模型（全选本页、扩选全部、Shift 连选、筛选后不丢选、行尾按钮不触发进详情、批量条的出现与消失、空态）各一条；概览页的统计与分布条各一条；八个元数据页共用件改造后跑既有测试确认行为未变；`tests/theme.test.tsx` 删除并在提交信息里说明。**新增断言不得依赖颜色** —— 状态区分要能在不看颜色时成立 |
| **III** UX 一致性 | **组件全部来自 shadcn/ui**，本轮只改它们的类名，行为层（Radix）不动。**需要四个自定义组件**：统计卡、类别分布条、状态流转时间线、标签预览卡 —— 均为 shadcn 没有的形态。**每一个在实现前单独向开发者确认**（FR-010），不接受事后补批。表格页的零件仍然只有一套（`ListToolbar` / `useListQuery` / `Pager` / `CrudPage`），不为任何一页复制变体 |
| **IV** 性能要求 | **无新增查询路径、无新索引、不改分页**。前端 bundle 的影响是本轮唯一的性能议题：字体是新增的静态资产，分片方案下首屏只取用到的几片，但**二进制体积是全部分片之和**。SC-009 定了 8 MB 上限，实现阶段以实际产物验证（见风险表） |
| **V** 语言规范 | 文档中文、代码英文。**新增的用户可见文案**：批量条（已选 N 台 / 清空 / 变更状态 / 调整使用人 / 导出 / 打印标签）、全选横幅（本页 N 条已全选 / 选中符合当前筛选的全部 N 条 / 按住 Shift 可连选）、行尾按钮的三个 `aria-label`（打印标签 / 变更状态 / 查看详情）、概览页的统计卡标签与「待我处理」。**每一条同时进 `zh.ts` 与 `en.ts`**（`typeof zh` 约束会在漏写时编译失败）。**移除的文案**：`nav.toLight` / `nav.toDark` 及设置里的主题项 —— 移除后 `tests/i18n.test.ts` 的孤儿检查会抓到没删干净的条目 |

**技术栈约束**：后端不动。前端沿用 Vite + React + TypeScript + react-router +
Tailwind CSS + shadcn/ui + TanStack Query。**移除 `next-themes`** 是减依赖，
不属于「新增框架级依赖」，无需修订章程。

**没有需要豁免的条目**，Complexity Tracking 为空。

## 项目结构

### 本特性的文档

```text
specs/017-organic-restyle/
├── spec.md              规格（决策 114–121）
├── plan.md              本文件
├── research.md          Phase 0：token 映射、圆角两档、深色移除面、字体风险
├── quickstart.md        Phase 1：实机走查
└── checklists/
    └── requirements.md  规格质量检查单
```

**没有 `data-model.md`**：本轮不引入实体、不改字段、不写迁移。
**没有 `contracts/`**：不新增也不修改任何端点。这两份缺席是结论，不是遗漏。

### 源码

```text
web/src/
├── index.css                      token 层：十九个语义变量换 Organic 值；
│                                  删 @custom-variant dark、两组 .dark、八行 .dark .status-*；
│                                  --chart-1 换沙绿并删深色版；新增三处 @font-face 分片入口
├── assets/fonts/                  新增：Caprasimo、Figtree、Noto Sans SC 分片 + 三份 OFL LICENSE
├── components/ui/*.tsx            25 处 dark: 删除；九个组件的圆角改药丸；
│                                  sonner.tsx 摘掉 next-themes
├── features/
│   ├── theme/useTheme.tsx         删除
│   ├── common/                    PageHeader / TableFrame / Pager / ListToolbar：Organic 形态
│   ├── metadata/CrudPage.tsx      改一次，八个元数据页一起变
│   ├── assets/                    新增：批量条、全选横幅、行尾操作按钮、选择集 hook
│   └── overview/                  新增：统计卡、类别分布条
├── routes/
│   ├── AppShell.tsx               侧栏改 Organic；移除深浅切换
│   ├── Overview.tsx               按稿子重排
│   ├── Assets.tsx                 选择与批量模型重建
│   ├── Categories.tsx             视觉重排（树与搜索平铺的行为不变）
│   ├── Audit.tsx                  视觉重排；前后值的新旧区分不只依赖颜色
│   └── Login.tsx                  按稿子重排（两列 + 圆形色块）
├── features/settings/             移除主题控件（保留其余偏好）
└── i18n/{zh,en}.ts                新增批量与概览文案；移除 nav.toLight / nav.toDark

web/tests/                         受影响的断言更新；新增选择模型与概览的 DOM 测试；
                                   theme.test.tsx 删除
```

**结构决策**：不新建目录层级。四个自定义组件按既有惯例落位 ——
与资产相关的进 `features/assets/`，与概览相关的进 `features/overview/`。
不建 `features/organic/` 之类的横向目录：它们是**某个页面的零件**，不是一套并行的设计系统。

## 阶段

### 第 0 阶段：调研 ✅

见 [research.md](./research.md)。四个结论：token 映射表已定；圆角必须分两档；
深色移除面封闭且 `features`/`routes` 零污染；字体分片是唯一风险且有翻案点。

### 第 1 阶段：设计 ✅

- [quickstart.md](./quickstart.md) —— 实机走查
- **无 data-model.md / contracts/**，理由见上

### 第 2 阶段：实施顺序

依赖决定顺序：

```
token 层 + 字体 ─┬─ ui/*.tsx 形态（药丸、去 dark:）─┬─ 共用件（PageHeader/TableFrame/Pager/CrudPage）
                 │                                   │        └─ 八个元数据页自动到位
                 └─ 深色拆除（useTheme 及其引用者）   └─ 四个手写页重排 ─ 资产页的选择模型
```

**token 层必须最先做完**：后面每一步都在它之上验收，先改组件再改 token 等于每个组件看两遍。

**字体与 token 层并行**：字体是独立的资产管线，不阻塞任何 UI 工作，
但**必须在第一次视觉验收前就位** —— 否则看到的是回退字体，会误判形态。

**四个自定义组件各自先确认再实现**（章程原则三）。确认发生在动手前，不是做完之后。

**资产页的选择模型放在最后**：它是唯一改变操作方式的部分，需要在已经换好皮的
表格上验收，否则视觉问题与交互问题会混在一起看不清。

## 风险

| 风险 | 应对 |
|---|---|
| ~~**中文字体分片后总体积超出 SC-009 的 8 MB**~~ **已实测，未触发** | 二进制 42.4 → 47.4 MB，**增量 4.95 MB**，余量 3 MB。中文只取 400 与 700 两个字重（九个字重是 27 MB）。途中确实超过过：fontsource 每条 `src` 都带 woff 旧格式回退，Vite 把 **197 个 `.woff`、6 MB** 一并发了出来 —— 那是给 IE11 和 Android 4 准备的，而它们跑不了 React 19，那些 url 永远不会被解析。`vite.config.ts` 的 `dropWoffFallback` 在产物阶段剥掉这一段并删掉随之无人引用的文件。翻案点未动用 |
| 药丸控件在英文下文字换行 | 英文比中文长。每个改成 `rounded-full` 的控件都要在英文界面下看一遍，`white-space: nowrap` 是默认动作 |
| 焦点环在暖色底上不可见 | Organic 的焦点环是 2px 主色 + 2px offset，主色是陶土橙、底是奶油色，对比可能不足。**SC-008 要求键盘可达性不低于改造前** —— 逐个控件按 Tab 走一遍，不靠感觉 |
| 700 处 `getByRole` 断言里，改类名意外改掉了语义 | Radix 不动就不会掉 role。但改 `ui/*.tsx` 时若顺手动了元素类型（`div` → `button` 之类）就会。**每改完一个组件立刻跑测试**，不攒到最后 |
| 状态色与新底色的对比度不足 | 八个 `.status-*` 是为白底校的，奶油底会削弱对比。逐个复核，**且区分不得只靠颜色**（FR-005） |
| 半成品被误发布 | 一个分支做完再发（决策 121）。中途不打 tag、不合 main |
