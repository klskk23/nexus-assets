# Handoff: Nexus Assets — Organic 版面重做

## Overview

Nexus Assets 是公司设备的资产账本：录入设备、在持有方之间流转、按类别打印标签、维护类别与状态两套元数据。它的主题令牌已经换成 Organic（暖底、陶土、鼠尾草、28px 圆角、Caprasimo + Figtree），但页面骨架仍是 shadcn 的默认形态——居中内容列、横向导航、每块内容一张 Card。

这份交接包重做的是**版面**，不是主题。九个 HTML 参考稿把同一批令牌重新排了一遍，改的是布局、留白、字号层级、圆角用法和数量图形的形状。**没有引入任何新令牌**，`web/src/index.css` 不需要改。

## About the Design Files

这个包里的 HTML 文件是**设计参考稿，不是可以直接拷进仓库的生产代码**。它们用内联样式写成，只为把意图表达到像素级别。

任务是把这些设计**在目标代码库的现有环境里重建**——`nexus-assets` 是 React + TypeScript + Tailwind v4 + shadcn/ui，所以应当用它已有的组件（`Table`、`Field`/`FieldGroup`/`FieldSet`、`Dialog`、`Badge`、`Button`）和 Tailwind 工具类去实现，而不是把内联样式搬过去。

参考稿是 `.dc.html` 格式（一个内部预览容器）。只看 `<x-dc>` 与 `</x-dc>` 之间的标记，其余是预览外壳。

## Fidelity

**High-fidelity。** 颜色、字号、间距、圆角、交互状态都是最终值。应当按稿子的尺寸重建，用仓库里现成的组件和令牌。

唯一例外是数据：稿子里的设备数、编号、人名、时间都是示意用的假数据。

每屏的精确数值以同名 HTML 为准；下面的「Design Tokens」和「全局规则」两节是统摄所有屏的规范，冲突时以本 README 为准。

## 为什么这么改（七条审视结论）

重做的依据。完整版在 `Review.dc.html`。

1. **居中内容列不是这个系统的排版方式。** Organic 的方向是左对齐、不对称，内容贴左、留白留右。`AppShell` 用 `mx-auto max-w-7xl` 两侧对称留白 + 顶部横向导航，和这套令牌的性格相反。→ 改成左侧 236px 竖排导航，内容列贴左 960px 上限，右侧空着。
2. **卡片比页面深，"卡片墙"更刺眼。** 中性主题里 `--card` 是白色，卡片=抬起。这里 `--card` #ebddc5 比 `--background` #f5ead8 **深**，而 `--well` #f9f4ed 比两者都**浅**——卡片在压下、井在抬起，与名字相反。→ 三档地面各归各位（见下）。
3. **Caprasimo 只带拉丁子集。** `fonts/` 里 Caprasimo 只有一个 latin 子集，中文标题必然落到 Noto Sans SC。把 `font-heading` 挂到「资产」两个字上，什么也不会发生。→ Caprasimo 只给它管得住的字符：产品名、页码、计数、资产编号、字段键名。中文标题靠字号字重建立层级。
4. **深色主题和 Organic 的判断互相取消。** 仓库有完整 `.dark` 分支和一键切换，但 Organic 的整套推理建立在浅底之上，同步进来的 DS 也只有一组浅色令牌。→ 需要一个决定：撤掉切换与 `.dark` 分支，或为深色单独调一组暖色令牌（深棕底 + 提亮陶土）。**这条不在重做稿范围内**，它不是版面问题。
5. **数量图形是直角的，而颜色又不能用。** 产品硬规矩是颜色表示状态、图表不许借用状态色（所以 `--chart-1` = `var(--accent-2)`）。这意味着**形状是数量唯一还能自由使用的维度**，而 `CategoryChart` 用 recharts 直角条、圆角 4px。→ 数量画成 999px 药丸轨道和圆盘。
6. **28px 圆角需要比 24px 更多空气。** 骨架清一色 `gap-6`（24px），圆角互相顶着，柔读不出来。→ 分区 56px，区内成组 24px，圆角容器内边距 ≥24px，表格行高 40→48。
7. **登录页是唯一能自由排版的一屏，却做成了居中卡片。** → 表单贴左，右侧留白配柔形，产品名用 Caprasimo 放到该有的字号。

## Design Tokens

全部已存在于 `web/src/index.css`，**不要新增**。

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--background` | `#f5ead8` | 页面地面 |
| `--foreground` | `#201e1d` | 正文墨色 |
| `--card` | `#ebddc5` | **只给真正浮在页面之上的东西**：对话框、抽屉、悬浮卡 |
| `--well` | `#f9f4ed` | 下沉面：表头、只读值组、时间线行底 |
| `--secondary` / `--muted` | `#eee7db` | 次级面 |
| `--secondary-foreground` | `#2e2b25` | 说明性正文 |
| `--muted-foreground` | `#82796a` | 元信息、时间、次要数字 |
| `--primary` | `#c67139` | 陶土 = **动作**（主按钮、当前项、kicker） |
| `--primary-foreground` | `#f5ead8` | 陶土上的字 |
| `--accent` | `#fff2eb` | hover 浅底 |
| `--accent-foreground` | `#8c491a` | 链接色、hover 上的字、正文级陶土 |
| `--ring` | `#8c491a` | 焦点环 |
| `--accent-2` | `#8fa073` | 鼠尾草 = **数量**（轨道填充、圆盘、时间线圆点） |
| `--chart-1` | `var(--accent-2)` | 图表唯一颜色 |
| `--border` | `#201e1d29` | 输入框、次级按钮描边 |
| `--border-muted` | `#201e1d14` | 行分隔、弱描边 |
| `--radius` | `28px` | 容器圆角 |

主按钮 hover 用 `#b3632f`（陶土压深一档）。

**八个状态色槽**（`.status-slate/green/blue/amber/red/violet/teal/rose` + `.status-chip`）各带 `--status-bg` / `--status-fg` / `--status-line`。状态**只**由这套表达，一处不动。

### 间距与字号

| 项 | 值 |
| --- | --- |
| 分区之间 | `56px`（登录页 `64px`） |
| 区内成组 | `22–24px` |
| 圆角容器内边距 | `≥24px`（半径 28 的角需要这么多才不切内容） |
| 表格行高 | `48px` |
| 内容列上限 | `960px`（正文类 `760px`，表单 `620–640px`） |
| 侧栏宽 | `236px` |
| 页标题 h1 | `40px / 1.2 / 700`（登录页产品名 `52px / 1.05` Caprasimo） |
| 区标题 h2 | `21px / 700` |
| 正文 | `16px / 1.75`（导语 `17px`） |
| 元信息 | `13–14px` |
| kicker | `12px` Caprasimo，`letter-spacing:.12em`，uppercase，`--primary` |
| 大计数 | `34px` Caprasimo `tabular-nums` |
| 圆角 | 容器 `28px`，井/提示块 `20px`，一切小控件 `999px` |
| 控件高 | 输入/选择 `48px`（登录页 `50px`），按钮 `11–13px` 纵向内边距 |

字体栈：`"Figtree Variable", "Noto Sans SC", ui-sans-serif, sans-serif`；展示体 `Caprasimo, serif`（仅拉丁与数字）；等宽 `var(--font-mono)`。列里所有数字加 `font-variant-numeric: tabular-nums`。

## 全局规则

来自 `Principles.dc.html`（八条）：

1. **版面贴左，右边空着。** 侧栏 236px + 内容列 960px 上限，不居中。
2. **三档地面各归各位。** `--background` 页面 / `--well` 下沉 / `--card` 只给浮起。页面分区改用留白，不引入第四种底色。
3. **圆角三档，小控件全是药丸。** 28 / 20 / 999px。
4. **拉丁与数字给 Caprasimo，中文靠字号。**
5. **颜色分工是硬规矩。** 陶土=动作，鼠尾草=数量，八个状态色槽=状态。装饰只能用 `--muted`、`--well`、`--border`。
6. **间距** 见上表。
7. **数量画成轨道和圆盘**，不用直角条。轨槽 `--well`，填充 `--accent-2`。
8. **状态与焦点不用浏览器默认。** 每个可交互元素给 `--accent` 的 hover 浅底；焦点 `outline: 2px solid var(--ring); outline-offset: 2px`。

### 产品自己的判断（重做稿逐条保留，不要改）

- 行本身是点击目标，单元格里不放控件；行内操作在右键菜单或行尾悬浮条里。
- 翻页永远是表格下面那一行，含区间、页码、每页条数。
- 不可用的动作**禁用并说明缺什么**，而不是隐藏。
- 空状态要说清楚什么会填满它；被筛空了就给出清除筛选。
- 带输入的提示写在 placeholder 里；必须一直可见才用 `FieldError` 或 `Alert`。
- 表单一律 `Field` / `FieldGroup` / `FieldSet`。
- 层级用缩进表达，不放行内箭头——名称格里的箭头会连同行点击一起触发，一次点击出两个结果。

## Screens / Views

外壳：`OrganicNexus.dc.html`（导航）。九屏经由它翻页。

### 00 · 导航外壳 — `OrganicNexus.dc.html`
→ `web/src/routes/AppShell.tsx`

- **布局**：`display:flex; min-height:100vh`。左 `<aside>` 固定 236px，`padding:36px 18px 48px 30px`，右边框 `1px solid var(--border-muted)`；右 `<main>` `flex:1`，`padding:44px 40px 120px 56px`。
- **品牌块**：两行 Caprasimo 21px，"Nexus" 用 `--foreground`，"Assets" 用 `--primary`。
- **导航项**：药丸 `999px`，`padding:9px 14px`，字号 14px。当前项 `--primary` 实底 + `--primary-foreground` 文字；闲置项透明底，hover 换 `--accent` 底 + `--accent-foreground` 文字。每项左侧一个 Caprasimo 11px 编号，宽 18px。
- **已知待改进（未实施，四条）**：① 去掉 1px 右边框，侧栏改成一块圆角 `--well` 浮在地面上——Organic 明确反对 hairline-only geometry；② 编号做成 24px 圆（闲置描边、当前实心），现在的裸数字带 `opacity:.6`，压在陶土上对比不足；③ 当前态别用整条满填药丸，让圆点吃色、文字加重、药丸只留一层 `--accent` 浅底；④ 侧栏底部那段说明文字删掉。

### 01 · 概览 — `Overview.dc.html`
→ `Overview.tsx`, `features/overview/CategoryChart.tsx`, `features/transfers/Timeline.tsx`

- **页头**：左 kicker + h1「概览」，右两个按钮（次级「导入」、主「录入设备」），`justify-content:space-between`。
- **设备状态**：横向 flex-wrap 的五个按钮，每个 `min-width:152px`，`border-radius:28px`，`padding:22px 24px 20px`，`1px solid var(--border-muted)` 描边、地面色底，hover 换 `--accent` 底 + `--primary` 描边。内部竖排：状态 chip（`.status-*` + `.status-chip`，13px，`padding:5px 13px`）在上，Caprasimo 34px 计数在下。计数为 0 时数字降到 `--muted-foreground`。状态映射：在库 green / 已签出 blue / 维修中 amber / 丢失 red / 已报废 slate。
- **类别分布 + 快速录入**：`grid-template-columns: minmax(0,1.55fr) minmax(0,1fr); gap:40px`。左侧每行是一个按钮：104px 类别名 + 弹性药丸轨道（高 18px，槽 `--well`，填充 `--accent-2`）+ 46px 右对齐 Caprasimo 计数；hover `opacity:.72`。右侧一个类别下拉 + 主按钮。
- **最近流转**：`<ol>`，每行 `padding:18px 0` + `border-top:1px solid var(--border-muted)`（末行补 `border-bottom`）。行内左侧 10px 鼠尾草圆点，右侧：一行元信息（动作 chip 用 `--well` 底 + `--border-muted` 描边，非状态色；时间、操作人用 `--muted-foreground`），下面一句「自 X（状态） 至 Y（状态）」——地点人名用正文色，虚词和状态用 `--muted-foreground`。批量操作折成一条并带「批量操作（N 台）」chip。区标题右侧一个条数下拉。

### 02 · 资产列表 — `AssetList.dc.html`
→ `routes/Assets.tsx`, `features/common/ListToolbar.tsx`, `features/common/Pager.tsx`, `features/assets/useColumns.ts`

- 内容列 960px；工具条内的搜索框 640px 上限。
- **表格**：六列——编号 / 类别 / 状态 / 持有方 / 型号 / 负责人。表头坐在 `--well` 上，行高 48px，行分隔 `--border-muted`。编号列 Caprasimo + `tabular-nums`。状态列是 `.status-chip`。
- 行本身是点击目标，单元格里没有控件。行内操作在右键菜单：编辑、流转、打印标签、导出、删除。备注列默认关闭，在「显示列」里打开。
- 翻页在表格下面一行：区间、页码、每页条数。

### 03 · 资产详情 — `AssetDetail.dc.html`
→ `routes/AssetDetail.tsx`, `features/transfers/Timeline.tsx`

- **页头**：h1 是资产编号本身（Caprasimo，`tabular-nums`），旁边一个状态 chip。
- **设备属性**：`grid-template-columns: repeat(4, minmax(0,1fr))`，窄屏降到 `repeat(2, ...)`。每格是一个只读值组：键名小字（`--muted-foreground`，字段键名用 Caprasimo）+ 值。整块坐在 `--well` 上，圆角 28px，内边距 ≥24px。
- **流转历史**：同 01 的时间线样式，鼠尾草圆点 + `--border-muted` 行分隔。

### 04 · 签出与归还 — `Custody.dc.html`
→ `features/transfers/TransferForm.tsx`, `features/assets/ActionBar.tsx`

- 表单列 620–640px，贴左。
- 字段一律 `Field`/`FieldGroup`：目标持有方、目标状态、备注。控件高 48px、`999px` 圆角、`--input` 描边、地面色底。
- 批量流转时说清台数；提交后在时间线里折成一条「批量操作（3 台）」。
- 不可用的动作禁用并说明缺什么。

### 05 · 元数据管理 — `Metadata.dc.html`
→ `routes/Categories.tsx`, `routes/Statuses.tsx`, `features/metadata/MetadataTabs.tsx`

- 两张表，两个区，分区间距 56px。
- **类别**：名称 / 代号 / 编号字段 / 字段数 / 资产数。层级用**缩进**表达，名称格里不放箭头。展开折叠在行右键菜单里，和「新建子类别」放在一起。
- **状态**：显示名 / 键名 / 颜色 / 行为 / 使用情况。颜色列展示该状态对应的 `.status-*` chip；键名用 Caprasimo。
- 说明性文字 680px 上限。

### 06 · 打印标签 — `PrintLabels.dc.html`
→ `features/print/PrintDialog.tsx`

- **对话框**：620px 上限，`--card` 底（这是真正浮起的东西，用 `--card` 是对的），圆角 28px，内边距 32px，`box-shadow: 0 18px 44px -20px rgba(32,30,29,.35)`。字段：类别下拉、标签下拉（下面挂一条「在打印服务里打开这张标签 →」链接）、每台份数（`type=number`，200px 上限，`tabular-nums`）。
- **提示块**：`--well` 底，圆角 20px，`padding:18px 22px`，左侧 20px Lucide info 图标（`stroke-width:2.75`，色 `--accent-foreground`）。文案说清会产生几个作业、消耗哪段序号。**勾选的设备跨多个类别时一个类别一个作业**——标签版式属于类别。
- **作业列表**：每行一张 `--well` 圆角 28px 卡，`padding:22px 26px`，flex-wrap。左侧 190px 名称 + 序号区间；中间药丸进度轨（高 16px，槽 `--background`，填充 `--accent-2`）+ Caprasimo 分数；右侧状态 chip。进度轨数的是**张数不是状态**，所以用鼠尾草；只有「失败」那行用 `.status-red`，因为它确实是一个状态。「打印中」用地面底 + `--primary` 描边。

### 07 · 登录 — `SignIn.dc.html`
→ `routes/Login.tsx`

- **布局**：`grid-template-columns: minmax(0,420px) minmax(0,1fr); gap:64px; align-items:center; min-height:560px`。产品名 Caprasimo 52px/1.05 两行「Nexus / Assets」。
- **表单**：邮箱、密码（控件高 50px、`999px`、`--input` 描边）、主按钮「登录」；一条「或」分隔线（两侧 `--border-muted` 细线）；下面整宽的次级按钮「使用 Google 登录」。
- **右侧柔形**：`position:relative; height:440px` 里四个绝对定位的圆——`--card` 300px、`--accent-2` 190px（`opacity:.62`）、`--primary` 132px（`opacity:.9`）、`--border` 描边空心 84px。纯装饰，`aria-hidden="true"`，**没有借用任何状态色槽**。
- 这一屏在产品里没有侧栏导航。

## Interactions & Behavior

- **导航**：点击侧栏项切换右侧视图；当前项换实底药丸。
- **状态卡（01）**：点击按状态筛选并跳到资产列表。
- **类别行（01）**：点击按类别筛选并跳到资产列表。
- **表格行**：整行点击进详情；右键出操作菜单。
- **hover**：所有可交互元素给 `--accent` 浅底 + `--accent-foreground` 文字；主按钮压深到 `#b3632f`；类别行用 `opacity:.72`。
- **焦点**：`outline: 2px solid var(--ring); outline-offset: 2px`，绝不留浏览器默认蓝环。
- **链接**：默认 `--accent-foreground`、无下划线；hover 转 `--primary`。
- **禁用**：降到 45% 不透明度，并说明缺什么。
- **响应式**：内容列是 `max-width` 而非固定宽；详情页属性网格 4 列降 2 列；所有横向成组用 `flex-wrap`。参考稿没有做移动端断点。

## State Management

参考稿是静态的，只有外壳带状态。真实实现需要的状态与仓库现状一致，重做没有改变数据流：

- 外壳：`view`（当前屏）——真实实现里是路由。
- 列表：查询串、筛选（状态/类别/持有方）、排序、页码、每页条数、可见列、选中行集合。
- 详情：资产 id → 属性 + 流转历史。
- 流转表单：目标持有方、目标状态、备注、选中资产集合、提交中/错误。
- 打印：选中资产 → 按类别分组的作业列表、每台份数、序号区间预览。

## Assets

无图片。图标用 Lucide，`stroke-width: 2.75`（Organic 的要求，比默认更圆更重）。字体已在仓库里：Caprasimo（latin 子集）、Figtree Variable、Noto Sans SC。

## Files

`OrganicNexus.dc.html`（导航外壳）、`Review.dc.html`（七条审视）、`Principles.dc.html`（八条规则）、`Overview.dc.html`、`AssetList.dc.html`、`AssetDetail.dc.html`、`Custody.dc.html`、`Metadata.dc.html`、`PrintLabels.dc.html`、`SignIn.dc.html`。

`ds-base.js` 与 `support.js` 是预览外壳需要的，实现时不用管。本地打开 `OrganicNexus.dc.html` 可以翻遍九屏；这些文件从设计项目的 `templates/organic-nexus/` 复制而来，需要同目录下的 `styles.css` 与 `_ds_bundle.css` 才能正确显示样式。

## 待你决定的一件事

审视第 4 条：深色主题。仓库有完整 `.dark` 分支和一键切换，但 Organic 的整套推理建立在浅底之上。要么撤掉深色，要么为它单独调一组暖色令牌。重做稿没有覆盖这一条——它不是版面问题，需要产品决定。
