# Handoff: nexus-assets 前端 Nocturne 深色重构

## Overview
把 `klskk23/nexus-assets` 的 Web 前端（`web/src`，React + shadcn/ui，当前为「Organic」浅色语言）重构为 **Nocturne** 深色设计系统。覆盖全部 13 个路由页面与 13 种弹窗。布局有重组：全局壳改为紧凑左侧导航 + 内容区；配置类页面统一为「左侧列表 / 树 + 右侧详情卡」的主从结构；所有列表页统一「标题行（右上角主操作）→ 筛选行 → 表格 → 分页」。

## About the Design Files
本包内的 `Nexus Assets - Nocturne.dc.html` 是 **用 HTML 制作的设计参考 / 可点击原型**，不是可直接复用的生产代码。任务是 **在现有代码库（`web/`：React 19 + Vite + Tailwind v4 + shadcn/ui，路由 react-router，数据 TanStack Query）里按现有模式重做这套视觉**，即：
- 替换 `web/src/index.css` 的主题 token（见「Design Tokens」），保留 shadcn 组件的 API，重写其变体样式。
- 组件仍必须来自 shadcn/ui（项目 `CLAUDE.md` 硬规则）；本文说的 `.btn/.tag/.dialog` 等是 Nocturne 类名，落地时对应 `Button/Badge/Dialog` 的变体。
- 文案一律走 `web/src/i18n/{zh,en}.ts`，原型中的中文均取自 `zh.ts`，不要硬编码。
- 权限：前端只负责禁用 + `title` 说明原因（`deniedReason`），与现状一致。

原型的 `_ds/nocturne-*/styles.css` 是 Nocturne 的 token 与组件层，可作为 CSS 变量与状态样式的直接参照。

## Fidelity
**High-fidelity。** 颜色、字号、间距、圆角、阴影、悬停 / 按下 / 焦点态均为最终值，请按像素还原（表格列宽、卡片内边距等以原型渲染为准）。示例数据为编造的产品词汇数据，不是真实资产。

## 全局壳（AppShell）
- `grid-template-columns: 216px minmax(0,1fr)`，`height: 100vh`，两列各自滚动（`min-height:0; overflow-y:auto`）。
- **左侧导航 `<nav>`**：`padding: 18px 12px 14px`，右侧 `1px solid var(--color-divider)`，背景 `linear-gradient(to bottom, var(--color-surface), var(--color-bg) 60%)`。
  - 品牌：28px 方块（8px 圆角、1px accent 描边、accent 色的立方体线框图标 16px）+ 「Nexus **Assets**」（Inter 500 / 15px，Assets 用 accent）。
  - 三组：无标题组（概览、资产）；「配置」（类别、字段、型号、状态、持有方）；「权限与审计」（账号、角色、审计）。组标题 11px、`letter-spacing:.06em`、`--color-neutral-500`、`padding:14px 10px 4px`。
  - 导航项：`padding:7px 10px`，圆角 8px，13.5px，16px Phosphor 线性图标（stroke 16 / 256 视图框）+ 文字，`gap:10px`。默认 `--color-neutral-400`；悬停 `color-mix(text 6%)` 底 + `--color-text`；**激活**：文字 `--color-accent-200`，底 `color-mix(accent 12%)`，并在导航区左缘（`left:-12px`）画 2px 宽 accent 竖线，`box-shadow: 0 0 10px var(--color-accent)`（Nocturne 的「短实心 accent 标记」）。
  - 底部：顶边 1px 渐隐分隔（两端透明，24px 渐变）；用户按钮（28px 圆头像，底 `--color-accent-900`、字 `--color-accent-200`；姓名 13px + 角色 11px neutral-500），点击打开「设置」弹窗；右侧 30px 退出图标按钮（`.btn-secondary.btn-icon`）→ 回登录页。
  - Tweak `compactRail`：导航折叠为 60px 仅图标（`title` 提供文字）。
- **内容区 `<main>`**：`padding: 26px 36px 64px 32px`，内部 `display:grid; gap:22px`（概览 34px）。页面标题 `h1` 26px / Inter 500 / `margin:0 auto 0 0`，同一行右端放页面操作按钮（`gap:10px`）。
- **正文**：Inter 15px / 1.55，`--color-text`；弱化文字 `--color-neutral-400/500`；等宽（编号、键名、MAC、序列号）`ui-monospace, SFMono-Regular, Menlo, monospace` 12.5–13px。

## Screens / Views

### 1. 登录
- 全屏，背景 `radial-gradient(1200px 600px at 85% 30%, var(--color-accent-900), transparent 60%)` 叠 `--color-bg`；右侧装饰：两个 1px accent-800/700 描边圆（accent-700 圆带 80px 外发光 `color-mix(accent 18%)`），一条水平 1px 渐隐 accent 线（opacity .5）。
- 左对齐卡片区 `max-width:420px; gap:28px`：36px 品牌块（发光 `0 0 24px color-mix(accent 30%)`）+ 「Nexus Assets」28px；副标「内部资产台账」14px neutral-400。
- 表单：邮箱、密码（`.input` 40px 高）；「登录」`.btn-primary.btn-block` 40px；「或」分隔（两侧渐隐线，12px neutral-500）；「使用 Google 登录」`.btn-secondary.btn-block`。提交 → 概览。

### 2. 概览
- 标题行右侧：「批量导入」secondary、「录入设备」primary（带 + 图标）。
- 三张 `.card.elev-sm`（`padding:18px 20px; gap:14px`）自适应网格 `repeat(auto-fit, minmax(300px,1fr)); gap:16px`：**设备状态**（标题 16px + 「共 N 台」12px）、**类别分布**、**负责人名下**（副行「另有 N 人共 M 台」或「N 人名下有设备」）。
  - 分布行是按钮：`grid-template-columns: 96px 1fr 40px; gap:10px; padding:3px 4px; margin:0 -4px`，悬停底 `color-mix(text 5%)`。左：状态用 `.tag`（状态色）/ 文字 13px；中：6px 高轨道 `--color-neutral-900` 圆角 3px，填充色：状态用该状态 `bar` 色，类别 `--color-accent-600`，负责人 `--color-neutral-500`；右：数字 13px tabular neutral-300。点击 → 资产页带对应筛选。
- **最近流转**：标题 16px + 右侧 `select.input`（5 / 10 / 20 条，30px 高）；`.table` 四列：时间（neutral-400 tabular nowrap）、资产（等宽 13px `--color-accent-300`）、变更内容（`.tag.tag-neutral` 动作 + 文本，列宽 100%）、操作人。行可点 → 设备详情。

### 3. 资产列表
- 标题行右侧：批量导入（secondary）、导出 CSV（secondary，`title`「按当前筛选条件导出」）、录入设备（primary）。
- 筛选行 `flex wrap gap:8px`：搜索框 260px（左侧 14px 放大镜图标，`padding-left:30px`，占位「搜索编号、序列号、MAC」）；`select.input` 34px 高：全部类别（子类别前缀全角空格缩进）/ 全部状态 / 全部负责人 / 全部持有方；有筛选时出现「清除筛选」ghost；右端 12px「第 1–N 条，共 N 条」。
- 表格 `.table`：列 = 复选框（自定义 15px、1.5px neutral-600 描边、选中 accent 底 + bg 色勾）| 编号（等宽 13px）| 类别 | 状态（`.tag` 状态色）| 持有方 | 负责人（空→「无」）| 型号 | 厂商（neutral-400）| 备注（`max-width:220px` 单行省略，neutral-400，`title` 全文）| 行操作。
  - 整行可点开详情（`cursor:pointer`）；复选框与操作列 `stopPropagation`。
  - 选中行底色 `color-mix(accent 8%)`。
  - 行操作：悬停 / 焦点内才显示（`opacity 0→1`，.12s）：打印（28px ghost 图标）、流转。
- 底部：范围文字、每页 select（20 / 50 / 100）、上一页 / 下一页 secondary 30px（原型禁用）。
- **批量操作栏**：`position:fixed; bottom:22px; left:50%`，`.dialog` 风格浮层（surface 底、`--shadow-lg`、14px 圆角、`padding:8px 8px 8px 16px`）：「已选 N 台」accent-300 → 签出 / 归还 / 转移 / 打印标签 / 导出（secondary 30px）→ 删除（红 ghost）→ 取消选择（ghost neutral-400）。表头复选框全选 / 全不选。
- 空态：「当前筛选下没有资产，换个条件或清除筛选。」居中 14px neutral-500，40px 上下留白。

### 4. 设备详情
- `max-width:1100px; gap:30px`。顶部「← 资产」ghost 返回。
- 头部：编号 `h1` 30px tabular + 状态 `.tag` 12px；右侧：打印标签、编辑设备属性（secondary）、删除（红 ghost）、**流转**（primary）。下一行 13px neutral-400：「类别 · 型号 · 厂商」。
- 成功横幅（流转后）：`--color-accent-900` 底、`--color-accent-200` 字，13px，`padding:10px 14px`，勾图标。
- 四项事实 `dl.card.elev-sm`（`repeat(auto-fit, minmax(180px,1fr))`）：当前持有方 / 当前负责人 / 默认归属（下行 12px「默认负责人：X」）/ 建档时间。`dt` 12px neutral-500，`dd` 14px。
- **设备属性**：两列 `minmax(340px,1fr); gap:0 40px`；每行 `padding:10px 0`，底部 1px 渐隐线（24px 渐变）；`dt` 110px 13px neutral-500；`dd` tabular（计算项 / MAC / 序列号等宽）；右侧至多一个 `.tag.tag-outline` 10px：计算项 › 唯一 › 来自厂商 / 来自型号。备注独立一行。
- **流转历史**：三列表（时间 / 变更内容 100% / 操作人），变更内容内 `.tag-neutral` 动作 + 文本 + 12px「备注：…」。

### 5. 类别（主从）
- 标题行：「类别」+ 16px 圆形「?」提示（`title` 说明）；右上角「新建类别」primary。
- 左栏 280px：搜索框 32px；树行按钮 `padding:6px 10px`，`padding-left: 10 + depth*16`，13.5px，右端数量 12px neutral-500；子级默认 neutral-400；激活同导航（accent-200 字 + 12% 底）。
- 右栏 `.card.elev-sm padding:20px 24px gap:20px`：名称 20px + 代号等宽 12px + 右端「编辑类别」secondary；事实 `dl`（底 `--color-bg`、8px 圆角、`padding:14px 16px`）：上级类别 / 代号 / 编号字段 / 可打印的标签；链接「看这个类别的 N 台设备（含子类别）→」；「本类别的字段」表：显示名 / 键名 / 类型 / 必填（`.tag-outline` 或 —）/ 继承自（`.tag-neutral` 上级名 或 —）。

### 6. 字段（主从）
- 右上角：新建字段组（secondary）、新建字段（primary）。
- 左栏按组分节（基础信息 / 采购 / 网络 / 未分组，节标题 11px），行右端键名等宽 11.5px。
- 右栏：显示名 20px + 键名 + 类型 `.tag-neutral` + 「唯一」`.tag-outline` + 编辑字段；事实：绑定到 / 可搜索 / 所属组 / 校验（等宽）；有表达式时：「表达式」+ 「怎么写」链接（开帮助弹窗）+ `code` 块（`--color-bg` 底、左 2px accent 边、accent-300 字）；「绑在哪些目标上」表：目标类型 / 目标 / 必填 / 解绑（ghost 12px）；「＋ 绑定到类别」ghost。

### 7. 型号（主从）
- 右上角：新建厂商、新建型号。左栏按厂商分节（标题右端型号数），行 `padding-left:18px`，右端在册数。
- 右栏：型号名 20px + 厂商 13px + 「在册 N 台」`.tag-neutral` + 编辑型号；备注段；两栏 `minmax(320px,1fr)`：默认值表（键名 / 值）、这个型号的字段表（显示名 / 来源 `.tag-neutral`「厂商」「本型号」）。

### 8. 状态
- 右上角「新建状态」。搜索框 `max-width:360px`。表：显示名（状态 `.tag`）/ 键名（等宽）/ 类型（内置 / 自定义）/ 行为（`.tag-neutral`「终态」「不计入类别分布」或 —）/ 使用情况（「N 台设备・历史 M 条」）。行点开编辑。

### 9. 持有方（主从）
- 右上角「新建持有方」。左栏树：名称 + 类型 11px（公司 / 部门 / 位置）+ 数量；树下 12px「默认库存点：上海仓库」。
- 右栏：名称 + 类型 `.tag-neutral` + 「默认库存点」`.tag-outline`；右端「设为默认库存点」secondary（非位置 / 已是库存点时禁用并 `title` 说明）+ 「编辑」primary；事实：类型 / 上级 / 默认库存点 / 放着的设备（链接）；备注段。

### 10. 账号
- 右上角「新建本地账号」。筛选：搜索 260px、全部角色、全部状态。表：邮箱（等宽 12.5px neutral-300）/ 姓名 / 角色 / 登录方式（Google 单点登录 / 本地密码）/ 状态（正常 `.tag-neutral`、已停用 `.tag-outline`）。行点开编辑。

### 11. 角色
- 右上角「新建角色」。表：名称 / 权限（管理员 → `.tag-accent`「全部权限」；否则「N 项」+ 前 4 项名称…）/ 账号数。表下 12px 说明文字。行点开编辑。

### 12. 审计（操作 / 流转）
- 标题「变更审计」或「流转审计」随 `.seg` 切换（操作审计 | 流转审计）；标题下 13px 说明。
- 操作审计筛选：搜索 260px、对象类型、操作、操作人、「全部时间」日期按钮（日历图标）、清除筛选、右端「共 N 条」。表：时间 / 操作人 / 操作 `.tag-neutral` / 对象（类型 + 12px 标识）。行点开「变更内容」弹窗。
- 流转审计筛选：资产编号（等宽 220px）、操作人、动作、全部时间。表同概览「最近流转」。行 → 设备详情。

## 弹窗（统一形制）
容器 `.dialog-backdrop`（`color-mix(neutral-900 50%)`）+ `.dialog`：`--color-surface` 底、`--shadow-lg`、14px 圆角、`padding:22px 24px`、`gap:16px`；标题 20px Inter 500，右上 28px ✕ ghost；底部 `.dialog-actions` 右对齐：「取消」ghost + 主动作 `.btn-primary`（描边，不是填充）；危险动作（删除）为红色 ghost（`oklch(0.72 0.12 20)`）放左侧 `margin-right:auto`。表单双列 `grid-template-columns:1fr 1fr; gap:12px`；`.field > label` 12px 70% 文本色。

| 弹窗 | 宽 | 内容 |
| --- | --- | --- |
| 设置 | 560 | 语言 `.seg`（中文 / English）+ 说明；API 密钥（右端「新建密钥」28px primary；表：名称 / 前缀 / 有效期至 / 最近使用 / 撤销）；接口文档链接 |
| 流转 | 520 | 标题后缀编号或「已选 N 台」；操作 `.seg`（签出 / 归还 / 转移 / 改负责人 / 改状态）；目标、负责人（含「不变」）；备注 textarea；提交后关闭并在详情页显示横幅「已完成 N 台的流转」，时间线插入新记录 |
| 新建 / 编辑状态 | 460 | 键名（编辑时禁用）、显示名、颜色 select + 实时 `.tag` 预览；新建时「行为」两个复选；内置提示 |
| 编辑类别 | 480 | 代号、名称、上级、编号字段、可打印的标签复选；左下「删除类别」→ 确认弹窗 |
| 录入设备 | 560 | 类别、设备型号、序列号、MAC、购入日期、持有方；说明「编号由该类别的显示编号字段推导，无需填写。」 |
| 编辑 / 新建账号 | 480 | 邮箱（编辑时禁用 + 说明）、姓名、角色、（新建）密码；编辑时「重置密码」（SSO 禁用）、「停用 / 启用」→ 确认 |
| 编辑 / 新建角色 | 560 | 名称；管理员显示只读说明；否则权限 19 项复选 `repeat(auto-fill, minmax(160px,1fr))`；左下「删除角色」（有账号时禁用） |
| 变更内容 | 640 | 一行描述；「变更前」（左 2px neutral-700 边，neutral-400 `pre`）与「变更后」（左 2px accent 边）JSON |
| **确认（type-to-confirm）** | 440 | `role=alertdialog`，容器左缘 2px 红色内阴影；标题、说明、「请输入 `<phrase>` 以确认」+ 复制按钮；输入匹配前主按钮禁用；主按钮红描边 |
| 批量导入 | 680 | 三步编号圆圈（完成 / 当前为 accent 描边，未到为 neutral-700）：① 导入到类别 + 下载模板；② 虚线文件区 + 琥珀色提示条「5 行中 4 行可以导入 · 有 1 行需要修正」+ 预览表（错误行问题列红字）；③ 确认导入（有错误时禁用） |
| 打印标签 | 560 | 计划态：拆分提示句 + 表（类别 / 标签 select / 数量）+ 「确认打印 N 张」；提交后：队列表（状态 `.tag` 打印中 / 已完成 + 4px 进度条 + 「已出 a/b 张」）+ 「消耗序号 seq：133–N」 |
| 导出 | 520 | 有勾选时 `.radio` 选范围（已勾选 N 台 / 按当前筛选）+ zip 说明；否则资产类别 select；导出字段复选 + 全选 / 全不选；固定列说明 |
| 表达式怎么写 | 640 | 可滚动：能读什么 / 例子 / 管道 / 可用函数 / 运算符 / 两条规矩，两列 `.table`（等宽 accent-300 键 + 说明）；「知道了」 |

## Interactions & Behavior
- 导航：左栏点击切换路由；「资产」在详情页也保持激活。
- 概览分布行 → `/assets?status=` / `?category_id=&include_descendants=true` / `?owner_id=`。
- 资产筛选即时生效；任何筛选变化清空选择。表头复选切换本页全选。
- 行悬停显示行操作；右键菜单（原型未做）保留原实现。
- 所有弹窗：点击遮罩或 ✕ 关闭；`Esc` 建议保留。
- 状态新建 / 编辑立即反映到所有状态标签与筛选项。
- 悬停 / 按下 / 焦点：全部沿用 Nocturne（`.btn-*:hover/:active` 为 accent 或文本色的 7–22% 混色；`:focus-visible` 2px accent 外框；禁用 45% 不透明度）。无过渡动画，仅行操作 `opacity .12s` 与导航底色 `transition-colors`。
- **CJK 换行**：所有按钮、标签、表头、分段选项、复选标签必须 `white-space:nowrap`（中文可在任意字间断行，flex 收缩会竖排）。

## State Management（原型中的，供参照）
`screen`、`assetId`、`categoryId`、`fieldId`、`modelId`、`holderId`、筛选 `q/fCategory/fStatus/fOwner/fHolder`、`selected[]`、`dialog`、`banner`、`tKind`/`transferIds`、`statuses[]`（可增改）、`events[]`（流转后追加）、`auditTab`/审计筛选、`confirm{title,description,phrase,onConfirm}`+`confirmTyped`、`printIds`/`printSubmitted`、`exScope`。真实实现沿用现有 TanStack Query 与 URL 查询串（筛选进地址栏）。

## Design Tokens（来自 `_ds/nocturne-*/styles.css`）
- 地面 `--color-bg #161826`；表面 `--color-surface #232532`；文本 `--color-text #e9e9ed`；accent `--color-accent #9184d9`；分隔 `--color-divider: color-mix(#e9e9ed 16%)`。
- 中性色阶 100–900：`#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31`。
- accent 色阶 100–900：`#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741`。
- 字体：Inter（标题 500，正文 400）；正文 15px/1.55；页面标题 26px；卡片标题 16–20px；表格 14px；表头 11px 大写 `letter-spacing .08em` 60% 文本色。
- 间距：`--space-1…8 = 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4px`（0.7× 密度）；页面 gap 22px；卡片 padding 18–24px。
- 圆角：`--radius-sm 4px / md 8px / lg 14px`。
- 阴影：`--shadow-sm: 0 0 0 1px #3f424d`；`--shadow-md: 0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)`；`--shadow-lg: 0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)`。
- 分隔线：渐隐规则 `linear-gradient(to right, transparent, divider 48px, divider calc(100% - 48px), transparent)`，表格行用 8% 文本色。
- **状态色（8 个调色板槽位，深色地面版）** `bg / fg / bar`：
  - slate `oklch(0.34 0.02 260) / oklch(0.86 0.02 260) / oklch(0.62 0.03 260)`
  - green `oklch(0.34 0.06 150) / oklch(0.88 0.10 150) / oklch(0.66 0.12 150)`
  - blue `oklch(0.34 0.07 250) / oklch(0.88 0.08 250) / oklch(0.66 0.12 250)`
  - amber `oklch(0.36 0.07 75) / oklch(0.90 0.12 80) / oklch(0.72 0.14 75)`
  - red `oklch(0.34 0.08 20) / oklch(0.88 0.10 20) / oklch(0.64 0.16 20)`
  - violet `oklch(0.34 0.08 300) / oklch(0.88 0.08 300) / oklch(0.66 0.13 300)`
  - teal `oklch(0.34 0.05 190) / oklch(0.88 0.08 190) / oklch(0.66 0.10 190)`
  - rose `oklch(0.34 0.07 350) / oklch(0.88 0.09 350) / oklch(0.66 0.14 350)`
  - 危险文字 / 描边 `oklch(0.72 0.12 20)` / `oklch(0.64 0.16 20)`。
- 状态 `.tag`：11px、`padding:3px 10px`、圆角 6px、`letter-spacing .02em`。

## Assets
- 图标：Phosphor（https://phosphoricons.com）线性风格；原型内联了简化 SVG（256 视图框、stroke 16、圆头圆角），落地请替换为 `@phosphor-icons/react`（或保留现有 lucide 但统一 1.5px 线宽），映射见 `web/src/features/common/navIcons.ts`。
- 品牌标：立方体线框（Phosphor `Cube`）置于 1px accent 描边方块内，替代原三圆 logo。
- 无图片资源。

## Files
- `Nexus Assets - Nocturne.dc.html` — 全部 13 屏 + 13 个弹窗的可点击原型（模板 + 逻辑 + 示例数据）。
- `_ds/nocturne-fb90bb99-ec0e-40a0-98e7-e7bd64fe3e38/styles.css` — Nocturne token 与组件层。
- `_ds/nocturne-fb90bb99-ec0e-40a0-98e7-e7bd64fe3e38/readme.md` — 设计系统指南。
- `github.md` — 屏幕与仓库源文件对照表。
