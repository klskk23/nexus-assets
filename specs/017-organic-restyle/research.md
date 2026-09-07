# 调研：Organic 风格前端重构

四个问题决定这一轮的形状。三个的答案让工作量比预估小，一个比预估大。

---

## 一、换配色要改的是 token 值，不是组件类名

`web/src/index.css` 已经是**语义 token 层**：`:root` 定义 `--background` / `--primary` /
`--border` / `--well` / `--radius` 等十九个变量，`@theme inline` 把它们映射成 Tailwind 的
`--color-*`，组件里写的是 `bg-primary` `text-muted-foreground` `border-border`。

**结论**：把 Organic 的色值填进这十九个变量，全站配色一次到位，
`ui/*.tsx` 与所有页面的类名**一个字都不用改**。

映射（Organic → 本项目的语义槽）：

| 语义槽 | Organic 来源 |
|---|---|
| `--background` | `--color-bg` `#f5ead8` |
| `--card` / `--popover` | `--color-surface` `#ebddc5` |
| `--foreground` | `--color-text` `#201e1d` |
| `--primary` | `--color-accent` `#c67139`（陶土橙） |
| `--primary-foreground` | `--color-bg`（按钮上的字是底色，Organic 的 `.btn-primary` 就这么做） |
| `--secondary` / `--muted` | `--color-neutral-200` `#eee7db` |
| `--muted-foreground` | `--color-neutral-600` `#82796a` |
| `--accent`（悬停底） | `--color-accent-100` `#fff2eb` |
| `--border` | `--color-divider`（墨色 16%） |
| `--border-muted` | 墨色 8%（Organic 的表格行线就是这个值） |
| `--well` | `--color-neutral-100` `#f9f4ed` |
| `--ring` | `--color-accent`（Organic 的焦点环是 2px 主色 + 2px offset） |
| `--destructive` | 保留现值 —— Organic 没给危险色，而删除确认必须刺眼 |

**被拒绝的做法**：把 Organic 的 `.btn` / `.tag` / `.input` 那套类原样搬进来。
它们与 Tailwind 的工具类体系并存会产生两套互相覆盖的规则，
而且 Organic 那份 CSS 里的 `.btn` 不含焦点管理 —— 抄过来就是拿可用性换像素。

## 二、圆角要分两档，不能只调一个变量

`--radius: 0.625rem`（10px）派生出 sm/md/lg/xl 四档。Organic 要的是两种**不同性质**的圆角：

- **盒子**（卡片、对话框、面板）：`calc(--radius-lg * 1.15)` ≈ 32px
- **小控件**（按钮、tag、输入框、分段控件）：`999px`，即药丸

一个 `--radius` 派生不出这两者 —— 把它调到 32px，按钮会变成圆角矩形而非药丸；
调到 999px，卡片会变成胶囊。

**结论**：`--radius` 提到 `28px` 供盒子使用，药丸在组件源码里直接写 `rounded-full`。
`ui/*.tsx` 是本仓库自己的源码，改 `rounded-md` → `rounded-full` 是一行的事。
需要改的组件：button、badge、input、textarea、select trigger、toggle、toggle-group、
tabs trigger、input-group。

## 三、深色的移除面是封闭的，且不大

|  | 位置 | 处理 |
|---|---|---|
| 主题实现 | `features/theme/useTheme.tsx` | 删除（**不是** next-themes，是自己写的） |
| 引用者 | `main.tsx`、`AppShell.tsx`（切换按钮）、`SettingsDialog.tsx`、`usePreferences.ts`、`test/renderWithProviders.tsx` | 逐个摘除 |
| `next-themes` | **只有** `components/ui/sonner.tsx` 用到 | 改成固定浅色后移除依赖 |
| 样式 | `index.css` 的 `@custom-variant dark`、两组 `.dark` 块、八行 `.dark .status-*` | 删除 |
| 组件里的 `dark:` | `ui/` 下 **15 个文件共 25 处**；`features/` 与 `routes/` 里 **0 处** | 删除那 25 处 |
| 测试 | `tests/theme.test.tsx` | 删除 |
| 服务端 | `users.theme` | **不动**，不写迁移（FR-002） |

`features/` 和 `routes/` 里一处 `dark:` 都没有 —— 深色完全靠 token 层实现，
这正是它能干净拆除的原因。

## 四、字体是这一轮唯一的技术风险

三款都是 SIL OFL，自托管合规。拉丁两款（Caprasimo、Figtree）是几十 KB 量级，不是问题。
**Noto Sans SC 是问题**：完整 woff2 在 MB 量级，直接打进二进制会让分发体积失控。

两条可行路径：

1. **unicode-range 分片**（Google Fonts 自己的做法）：切成上百个小 woff2，
   浏览器按页面实际用字取。总体积不变，但**首屏只下载用到的那几片**。
   代价是上百个文件进 `dist/` 与二进制。
2. **按项目用字裁剪**：扫描 `zh.ts` 与代码里的中文，生成一个只含这些字的子集。
   体积最小（数十 KB 量级），但**用户数据里的汉字**（设备名、备注、类别名）不在扫描范围内，
   会落到回退字体，造成同一页两种字形。

**结论：走 unicode-range 分片。** 路径 2 的缺陷是致命的 ——
这是一套录入中文设备名的台账，用户数据里的字必然超出界面文案的字集。

**SC-009 的 8 MB 上限需要在实现阶段用实际产物验证。** 分片方案下首屏只取几片，
但**二进制体积是全部分片之和**。若实测超出，选择是：接受更大的二进制并修订 SC-009，
或退回「只自托管拉丁、中文用系统栈」并修订 FR-006。**这是本轮唯一预留的翻案点。**

## 五、两个已验证的前提

- **「选中符合筛选的全部 N 条」不需要新端点**：`internal/asset/query.go` 的
  `ListResult` 已经返回 `total`，前端拿到的就是筛选后的总数。
- **图表色只有两个值要换**：`--chart-1` 的浅色版与深色版。删掉深色那行，
  浅色换成 Organic 的沙绿 `--color-accent-2-500 #8fa073` ——
  它与陶土橙拉开，且不与任何状态色撞（状态色是八个 oklch 调色板，色相分布在 5–300）。

## 六、被拒绝的替代方案

| 方案 | 为什么不做 |
|---|---|
| 抛弃 shadcn，按 Organic 的类体系重写组件层 | 24 个组件依赖 Radix 的行为层；重写等于重做焦点陷阱、键盘导航与 aria，且 700 处 `getByRole` 断言要重想。换来的只是那 11 个纯标记组件的类名更像稿子 —— 而它们本来就能随便改 |
| 保留深色，为 Organic 推一套暖色深底 | 稿子没有深色版，推一套要额外一轮设计与校色；开发者选择下架 |
| 只自托管拉丁字体，中文用系统栈 | 分发体积最小，但中文在不同机器上字形不一。作为字体分片方案的**翻案备选**保留 |
| 采纳稿子的 chip + token 筛选行 | 与「筛选是一栏」冲突，且要同时改资产、审计、字段三页才一致。本轮不动筛选行 |
