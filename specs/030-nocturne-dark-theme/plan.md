# Implementation Plan: Nocturne 深色系统，像素级换皮

**Branch**: `030-nocturne-dark-theme` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/030-nocturne-dark-theme/spec.md`

## Summary

把 Organic 浅色语言换成 Nocturne 深色系统，按 `design/handoff.md` 的版面数字像素级还原
13 屏 + 13 弹窗。技术路径：**`index.css` 的十九个语义槽位保留名字只换值**（token 映射见
`research.md` §一），暴露两条色阶，整表替换八组状态色；**23 个 shadcn 组件按角色重写
变体**（药丸整条作废、主按钮改描边、去全部进出场动画）；feature 层按 `design/screen-map.md`
逐屏改版面数字；图标 lucide → Phosphor 全量替换、字体 Figtree/Caprasimo → Inter Variable
（Noto Sans SC 加 500）；新增导航折叠。服务端零改动。验收靠真浏览器逐屏截图对照原型，
证据存 `walkthrough/`。

## Technical Context

**Language/Version**: TypeScript 5 / React 19（前端）；Go 1.26（本轮零改动）

**Primary Dependencies**: Vite 6、Tailwind v4、shadcn/ui（Radix）、TanStack Query v5、
react-router v7。**本轮变更**：`+@phosphor-icons/react 2.1.10`、`+@fontsource-variable/inter 5.3.0`、
`@fontsource/noto-sans-sc` 多引 `500.css`；`−lucide-react`、`−@fontsource/caprasimo`、
`−@fontsource-variable/figtree`、`−tw-animate-css`

**Storage**: N/A（唯一新增客户端状态：`localStorage["nexus.nav.collapsed"]`）

**Testing**: Vitest 3 + RTL（`--maxWorkers=4`）；源码不变量测试；Playwright MCP 实机走查

**Target Platform**: 现代桌面浏览器；视口 1440×900 为验收基准；`max-md` 只查不破

**Project Type**: web application（仅 `web/`）

**Performance Goals**: 初始 chunk gzip ≤ 512KB（现 194KB；去 lucide 与 tw-animate-css、
加 Phosphor 树摇后预期持平或下降）；woff2 增量 ≤ 2MB

**Constraints**: 像素级还原（决策 215）；组件必须来自 shadcn/ui；颜色零硬编码；
自托管字体；`whitespace-nowrap` 的 CJK 规则；jsdom 量不了版面——版面归实机

**Scale/Scope**: 13 路由页 + 13 弹窗；23 个 ui 组件；~20 个 feature 共用件；53 个文件的
图标引用；507 条既有测试 + 新增

## Constitution Check

依据 `.specify/memory/constitution.md` v1.2.0。

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | 分层边界不涉及（纯前端）。**新增依赖**：`@phosphor-icons/react`（原型指定 Phosphor；保留 lucide 统一线宽被拒——每个图标形状都会成为像素差异）、`@fontsource-variable/inter`（原型指定 Inter；自托管规则不变）。**移除**：lucide-react、caprasimo、figtree、tw-animate-css。图标与字体不在章程「技术栈约束」的框架级清单里，**不需修订章程**；理由写进 PR 描述。`tsc`、eslint 零错误。 |
| II | 测试标准 | 核心管线零改动，覆盖率不受影响；无端点变更。**DOM 测试**：新增 `navCollapse.test.tsx`（折叠 / 展开 / 持久化）；改 `login.test.tsx`；凡断言 Organic 类名的既有测试随屏改。**源码不变量**：新增 `nocturne.test.ts` 九条，改 `contentColumn.test.ts`、`favicon.test.ts`。本轮至少两处**红→绿双向验**：状态色 24 值、`animate-` 零命中。 |
| III | 用户体验一致性 | 全部用既有 shadcn 组件重写变体：`Button/Badge/Input/InputGroup/Select/Dialog/AlertDialog/Popover/DropdownMenu/ContextMenu/HoverCard/Tooltip/Tabs/ToggleGroup/Toggle/Table/Card/Checkbox/RadioGroup/Alert/Progress/Skeleton/Spinner/Sonner/Drawer`。**不新建自定义组件**（原型每一形制都有对应物，见 research §二；若实施中发现例外，先问）。禁止内联 `style`——版面数字走 Tailwind 任意值类。加载 / 空 / 错误三态不变。焦点可见：`:focus-visible` 2px `--ring`，两种底 5.46 / 4.71。 |
| IV | 性能要求 | 无新增查询。bundle：去两个库、加一个树摇库，预算内（SC-007 量）。字体不进 JS chunk。交互反馈：去动画后弹窗即开即关，只会更快。 |
| V | 语言规范 | 文档中文、代码英文。**新增用户可见文案**：`nav.collapse`「折叠导航」/ "Collapse navigation"、`nav.expand`「展开导航」/ "Expand navigation"（品牌块按钮的 `aria-label`/`title`）。其余文案不变，原型中文均取自 `zh.ts`。 |

**技术栈约束**：Vite + React + TypeScript + react-router + Tailwind + shadcn/ui + TanStack Query
全部沿用；无偏离。

**Post-design re-check**（Phase 1 后）：research §二确认零自定义组件；contracts 确认零
硬编码色；quickstart 确认焦点环用真键盘验。**通过。**

## Project Structure

### Documentation (this feature)

```text
specs/030-nocturne-dark-theme/
├── plan.md              # 本文件
├── spec.md              # 决策 215–232
├── research.md          # token 映射、变体清单、图标表、守卫、走查方法
├── data-model.md        # 无数据变化；唯一客户端状态
├── quickstart.md        # 走查手册 + 差异记录表
├── contracts/
│   └── ui-tokens.md     # token 逐值、状态色 24 值、零命中清单、版面数字白名单
├── design/              # 四份输入（有约束力）
│   ├── handoff.md
│   ├── prototype.dc.html
│   ├── screen-map.md
│   └── nocturne-ds/{styles.css,readme.md}
├── walkthrough/         # 26 张截图（实施时填）
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 产出
```

### Source Code (repository root)

```text
web/
├── package.json                       # 依赖增减
├── vite.config.ts                     # 不动（dropWoffFallback 照旧）
├── index.html                         # 三个 <link> 不动，文件重出
├── public/{logo.svg,favicon.ico,apple-touch-icon.png,fonts/}   # 重出 + 许可证
├── src/
│   ├── index.css                      # token 整表、@theme、.status-*、color-scheme
│   ├── assets/fonts/fonts.css         # Inter + Noto 400/500/700
│   ├── components/ui/*.tsx            # 23 个变体重写、去动画
│   ├── i18n/{zh,en}.ts                # nav.collapse / nav.expand
│   ├── routes/AppShell.tsx            # 壳、导航、折叠
│   ├── routes/Login.tsx               # 第 1 屏重写
│   ├── routes/*.tsx                   # 逐屏版面数字（按 screen-map）
│   ├── features/common/{MasterDetail,Rail,RailRow,TreePager,PageHeader,Pane,
│   │                    TableFrame,ListToolbar,Hint,Logo,navIcons}.*   # 共用件
│   ├── features/common/useNavCollapsed.ts   # 新
│   ├── features/assets/ActionBar.tsx
│   ├── features/overview/DistributionBar.tsx
│   ├── features/statuses/StatusBadge.tsx
│   └── features/**                    # 图标替换（53 文件）
└── tests/
    ├── nocturne.test.ts               # 新：九条源码不变量
    ├── navCollapse.test.tsx           # 新：DOM
    ├── contentColumn.test.ts          # 改：白名单 = 原型数字
    ├── favicon.test.ts                # 改：钉 --primary/--background
    └── *.test.tsx                     # 随屏改 Organic 类名断言

docs/rules/web-forms.md                # 「视觉（017 Organic）」→「视觉（030 Nocturne）」
docs/rules/web-tables.md               # 「版面数字（018）」按新值改写
CLAUDE.md                              # 当前计划指针
```

**Structure Decision**: 单一 web 应用，只动 `web/` 与两份规则文档。服务端目录零改动，
`go test` 只作回归确认。

## 实施顺序（给 /speckit-tasks 的骨架）

按屏分阶段，**每屏一个 checkpoint = 实机截图对照原型**。地基先行，因为每一屏都站在它上面：

1. **地基**（不可并行，一次到位）：依赖增减 → `fonts.css` → `index.css` token 整表 +
   色阶 + 状态色 + `color-scheme` → 去 `tw-animate-css` → `nocturne.test.ts` 九条**先红**
   → 23 个 ui 变体重写 → 九条转绿。Checkpoint：任意一页打开是深色、按钮描边、
   弹窗即开即关；`grep` 九条零命中。
2. **图标与标志**：Phosphor 映射表、`navIcons.ts` 25 条、53 文件替换、`Logo.tsx`、三个
   图标文件重出、`favicon.test.ts` 改钉。Checkpoint：`lucide-react` 零命中，标签页图标是立方体。
3. **壳**：`AppShell` 216px 两列、三组导航、激活竖线、底部账号行、折叠（钩子 + i18n +
   `navCollapse.test.tsx`）。Checkpoint：截图 02 的壳部分；量 216 / 60。
4. **共用件**：`MasterDetail` 280、`Rail*`、`PageHeader`、`Pane/Fact`、`TableFrame`、
   `ListToolbar`、`Hint`、`ActionBar`、`DistributionBar`、`StatusBadge`。
   Checkpoint：`contentColumn.test.ts` 改写后绿。
5. **13 屏，每屏一个任务**：登录（01）→ 概览（02）→ 资产列表（03）→ 设备详情（04）→
   四个主从页（05–07、09）→ 四个表格页（08、10–12）→ 流转审计（13）。
   每屏：改版面数字 → 随屏改测试 → 截图存档 → 差异记录。
6. **13 弹窗，每个一个任务**：容器已在地基里换好，这里只剩各弹窗自己的宽度、内部
   布局与特殊件（确认弹窗红缘、导入三步圆圈、打印进度条）。每个：截图存档 → 差异记录。
7. **量化验收**：焦点环真键盘 + 对比度、English 不破版、导航宽度、bundle 与 woff2 增量。
8. **文档**：`web-forms.md` 视觉节整段改写（写明推翻 017 的哪几条、焦点环为什么可以
   直接用主色）、`web-tables.md` 版面数字节改写、`CLAUDE.md` 指针。
9. **七条门禁本地全跑** → 一次提交（或按阶段提交）→ **不推送，不打 tag**（决策 232）。

## Complexity Tracking

> 无章程违反项。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
