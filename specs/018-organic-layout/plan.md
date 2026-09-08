# 实施计划：Organic 版面重做

**分支**：`018-organic-layout` ｜ **规格**：[spec.md](./spec.md) ｜ **决策**：122–129

## 概要

把页面版面重排成 Organic 的排版方式。**不改一个颜色令牌**，不写迁移，
服务端零改动 —— 改的是这些颜色被排布的方式：内容列的位置与上限、
分区的节奏、地面的分工、中文标题的层级、表格的呼吸。

调研（[research.md](./research.md)）把这一轮从「重排十六个页面」缩成了
「改五个共用件 + 十九处地面判断 + 逐页调节奏」：

1. **表格三件套改一次，十个表格页一起变** —— 而且表头底色与行分隔线 017 就对了，
   实际差的只是内边距
2. **`font-heading` 只有一处是错的**（`PageHeader` 的中文 h1）
3. **零测试断言尺寸类** —— 纯版面改动不打测试

规格里唯一一颗钉子（FR-017 的焦点环重测）**已经在调研阶段拔掉**：
换成 outline 后四种底色实测 5.09–6.22，全过。

## 技术背景

沿用既有技术栈。**零依赖变动**。

| | |
|---|---|
| 前端 | React 19 · Vite 6 · Tailwind v4 · shadcn/ui · TanStack Query v5 · react-router v7 |
| 服务端 | **一行不动**。零迁移、零端点变化（SC-009） |
| 令牌 | `web/src/index.css` 的颜色值**一个不改**（参照稿明文要求） |
| 测试 | Vitest 3 + RTL；现有 367 例、712 处角色断言，其中断言尺寸类的 **0** 处 |
| 新增依赖 | 无 |

**没有 NEEDS CLARIFICATION。** 五个分支在 `/grill-me` 里逐条决断过，
第六个（侧栏）是刻意的双版本产出，不是缺失的答案。

## 章程检查

依据 `.specify/memory/constitution.md` v1.2.0。逐条填写：

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| **I** 代码质量 | 分层边界不动，**`internal/` 零改动**（SC-009 把这条写成了验收标准）。前端分层保持：`components/ui` 是形状层、`features/` 是行为层、`routes/` 是页面。**零依赖增减**。改动集中在五个共用件（`TableFrame`、`TableHead`/`TableCell`、`PageHeader`、`CrudPage`、`AppShell`）与十九处 `Card`/`bg-card` 的逐处判断 —— 后者**不是全局替换**，`ActionBar` 与 `ui/card.tsx` 必须保持不变 |
| **II** 测试标准 | 核心管线（`internal/schema`、`internal/asset`、`internal/compute`）**一行不改**，覆盖率不受影响。**触及 UI 必须列 DOM 测试**，但调研第六节给出了这一轮的特殊形态：**不写断言类名的测试**（脆，且测实现不测行为）。DOM 测试守的是**版面改动不得破坏的行为**：资产页选择模型七项、行点击进详情、右键出菜单、空态给清除筛选、类别树搜索时切平铺。**版面本身的守门人是截图走查**，这一点在计划里明说，不假装测试覆盖了它 |
| **III** UX 一致性 | **不新增任何组件** —— 这一轮全部是重排现有组件。`Field`/`FieldGroup`/`Select`/`Dialog`/`Empty`/`Alert` 的用法一处不改。八个元数据页通过改 `CrudPage` 一次获得新版面（FR-024），不逐页各改一遍。产品自己的七条判断（行是点击目标、单元格不放控件、翻页在表格下方、禁用而非隐藏、空态说清、提示进 placeholder、层级用缩进）**参照稿逐条保留，本轮也逐条保留** |
| **IV** 性能要求 | **无新增查询路径、无新索引、不改分页、无新依赖**。bundle 体积影响预期为零到负（移除 `<Card>` 包裹只会减少 DOM）。本轮不触及 lazy chunk 边界 |
| **V** 语言规范 | 文档中文、代码英文。**本轮新增文案预期为零** —— 版面重排不产生新字符串。若某处结构调整需要新文案（如侧栏两版中删掉的说明文字要不要替代），**每一条同时进 `zh.ts` 与 `en.ts`**，`typeof zh` 约束会在漏写时编译失败；`tests/i18n.test.ts` 的孤儿检查会抓到删干净不彻底的条目 |

**技术栈约束**：不变。**没有需要豁免的条目**，Complexity Tracking 为空。

## 项目结构

### 本特性的文档

```text
specs/018-organic-layout/
├── spec.md              规格（决策 122–129）
├── plan.md              本文件
├── research.md          Phase 0：七个问题，含焦点环的重测结果
├── quickstart.md        Phase 1：实机走查
└── checklists/
    └── requirements.md  规格质量检查单
```

**没有 `data-model.md`**：不引入实体、不改字段、不写迁移。
**没有 `contracts/`**：不新增也不修改任何端点。
两份缺席是结论，不是遗漏 —— 和 017 同样的理由，但这一轮更硬：SC-009 把它写成了验收标准。

### 源码

```text
web/src/
├── components/ui/
│   ├── table.tsx                  TableHead / TableCell 的内边距 → 15px/20px；
│   │                              表头字重 500→600、色 muted→secondary-foreground
│   └── alert.tsx                  待判断：bg-card 但不浮起（见风险表）
├── features/common/
│   ├── TableFrame.tsx             bg-card → 地面色（容器与 28px 圆角保留）
│   ├── PageHeader.tsx             摘掉中文 h1 上的 font-heading；40px/1.2/700
│   ├── ListToolbar.tsx            搜索框 640px 上限；控件按内边距而非高度
│   └── Pager.tsx                  仍是表格下方一行（不动结构，只调节奏）
├── features/metadata/CrudPage.tsx 分区 24→56；改一次，八页一起变
├── features/overview/
│   ├── StatCard.tsx               <Card> → 地面色 + border-muted 描边；min-width 152
│   └── DistributionBar.tsx        已是药丸轨道（017 就对了）；只调尺寸与可点范围
├── features/transfers/Timeline.tsx  行内边距 18px；鼠尾草圆点；分隔线
├── routes/
│   ├── AppShell.tsx               侧栏 236px；**两版实现**（见待定）
│   ├── Overview.tsx               状态卡横排；分布/快速录入 1.55fr/1fr
│   ├── Assets.tsx                 内容列 960 上限；选择模型一件不少
│   ├── AssetDetail.tsx            属性四列网格坐 --well；h1 是资产编号走 Caprasimo
│   ├── Categories.tsx             缩进树不变，只调节奏
│   ├── Login.tsx                  两列 420/1fr、gap 64；去掉 bg-card 面板
│   ├── Import.tsx  Audit.tsx  AssetHistory.tsx   稿子没画，按规范推导
└── i18n/{zh,en}.ts                预期零新增；有则两份同步
```

**结构决策**：不新建目录、不新建组件、不删组件。这一轮**只改现有文件的类名与结构层级**。

## 阶段

### 第 0 阶段：调研 ✅

见 [research.md](./research.md)。七个结论：居中列已不存在（差的是上限）；
地面分工是十九处逐个判断而非全局替换；表格差距只在内边距；
`font-heading` 只错一处；焦点环重测通过；零测试断言尺寸类，验收落在截图；
按钮 44px 与控件 48px 不冲突。

### 第 1 阶段：设计 ✅

- [quickstart.md](./quickstart.md) —— 实机走查
- **无 data-model.md / contracts/**，理由见上

### 第 2 阶段：实施顺序

依赖决定顺序：

```
共用件（表格三件套 · PageHeader · TableFrame）
   └─ 十个表格页自动到位 ── CrudPage 分区节奏 ── 八个元数据页自动到位
地面分工（十九处逐个判断）
   └─ 与共用件并行，但必须在任何截图验收前完成
AppShell 两版 ──→ 【开发者裁定】──→ 其余页面按裁定的语汇收敛
逐页节奏（Overview · Assets · AssetDetail · Categories · Login）
   └─ 三个没画的页面（Import · Audit · AssetHistory）最后，照前面收敛出的语汇
```

**共用件必须最先做完**：十个表格页与八个元数据页都在它之上验收，
先改页面再改共用件等于每页看两遍。

**`AppShell` 两版是一道闸**：侧栏的语汇（hairline 对圆角 `--well` 块）会影响
其余页面怎么理解「浮起」。裁定之前不做最终的地面收敛。

**三个没画的页面放最后**：它们要照抄的是前面十三页**收敛出来的**语汇，
而不是我对规范的第一次解读。

## 风险

| 风险 | 应对 |
|---|---|
| **十九处 `Card` 逐个判断，判错一处就破坏规则** | 判据只有一句：**它浮在页面之上吗**。`ActionBar`（`sticky bottom-4`）是「是」，`ui/card.tsx` 是原语本身，其余十七处默认「否」。收口时 grep `bg-card` 与 `<Card`，逐处对着这句话复核一遍 |
| **`ui/alert.tsx` 的 `bg-card`** | Alert 不浮起，按规则该换。但它波及全站每一条提示，且参照稿没有画 Alert。**列为逐条确认项**，不在共用件阶段顺手改 |
| **测试守不住版面回归** | 已知且接受（调研第六节）。缓解：收口加一条静态检查 —— `bg-card` 的命中集合必须等于白名单；行高、分区间距在 quickstart 里逐页实测 |
| **改 `CrudPage` 打到八个页面的既有测试** | 只改类名与容器层级，不动 DOM 角色。每改完立刻跑那八页的测试，不攒到最后 |
| **`font-heading` 摘掉后中文标题变小** | 40px 比现在的 24px **更大**。真正的风险在反面：`AssetDetail` 的 h1 是资产编号，要**加上** `font-heading`，漏了就白改 |
| **侧栏两版做完开发者选了 A，而其余页面已按 B 收敛** | 所以两版是闸，不是收尾。裁定前只做共用件与地面分工，不做最终收敛 |
| **半成品被误发布** | 一个分支做完再发。017 的 20 个提交仍未推，018 在其上继续；中途不打 tag、不合 main |
