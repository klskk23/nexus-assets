# 调研：Nocturne 深色系统怎么落进 shadcn

七个问题。前三个决定 token 与组件层怎么对应，第四个是图标与字体的实际替换面，
第五个是守卫怎么改，第六个是走查怎么做，第七个是两处规则在新调色板上的读法。

---

## 一、Nocturne token → shadcn 语义槽位：一张映射表，不是两套并存

**结论：`index.css` 的十九个语义槽位全部保留名字、只换值；Nocturne 的两条色阶
（neutral / accent 各 100–900）作为新增 token 暴露给 Tailwind；`.status-*` 八组三值整表换掉。**

Nocturne 与 shadcn 对「accent」这个词的用法**相反**：Nocturne 的 `--color-accent`
是品牌色（本产品叫「动作色」，017 的陶土橙就是它），而 shadcn 的 `--accent` 是
**悬停底**。两套词汇并存、按名字对号会直接对错。所以映射按**角色**做，不按名字：

| shadcn 槽位（保留名） | 角色 | Nocturne 来源 | 值 |
|---|---|---|---|
| `--background` | 地面 | `--color-bg` | `#161826` |
| `--foreground` | 正文 | `--color-text` | `#e9e9ed` |
| `--card` / `--popover` | 表面 | `--color-surface` | `#232532` |
| `--primary` | **动作色**（描边、链接、激活、焦点） | `--color-accent` | `#9184d9` |
| `--primary-foreground` | 动作色上的字（几乎不用：主按钮是描边不是填充） | `--color-bg` | `#161826` |
| `--secondary` | 次要按钮悬停底 | `color-mix(text 7%)` | `color-mix(in srgb, #e9e9ed 7%, transparent)` |
| `--muted` | 沉下去的面（`.tag-neutral` 底、轨道） | `--color-neutral-900` | `#292b31` |
| `--muted-foreground` | 弱化文字 | `--color-neutral-400` | `#b2b6ca` |
| `--accent` | **悬停底**（菜单项、导航项） | `color-mix(text 6%)` | `color-mix(in srgb, #e9e9ed 6%, transparent)` |
| `--accent-foreground` | 悬停时的字 | `--color-text` | `#e9e9ed` |
| `--selected` **（新）** | 激活底（导航、树行、选中行） | `color-mix(accent 12%)` | `color-mix(in srgb, #9184d9 12%, transparent)` |
| `--selected-foreground` **（新）** | 激活时的字 | `--color-accent-200` | `#e7e5fe` |
| `--destructive` | 危险文字 | 交接文档 | `oklch(0.72 0.12 20)` |
| `--destructive-line` **（新）** | 危险描边 | 交接文档 | `oklch(0.64 0.16 20)` |
| `--border` / `--input` | 分隔与描边 | `--color-divider` | `color-mix(in srgb, #e9e9ed 16%, transparent)` |
| `--border-muted` | 表格行线 | 交接文档「8% 文本色」 | `color-mix(in srgb, #e9e9ed 8%, transparent)` |
| `--ring` | 焦点环 | `--color-accent` | `#9184d9`（见第七节的对比度） |
| `--well` | 沉底面（事实 `dl`、`code` 块） | `--color-bg` | `#161826` |
| `--accent-2` | 数量与装饰（负责人条） | `--color-neutral-500` | `#9397ab` |

**去掉的**：`--primary-hover`（Organic 专有；Nocturne 的悬停一律 `color-mix`，在变体里写）、
`--radius-2xl`（022 为弹窗加的第四档；Nocturne 弹窗就是 `--radius-lg` 14px）。

**新增暴露给 Tailwind 的色阶**：`--color-neutral-100…900` 与 `--color-accent-100…900`
写进 `@theme inline`。前者**覆盖** Tailwind 内建的 `neutral-*` —— 有意的：内建那套是
纯灰，Nocturne 的是蓝灰，两套并存时 `text-neutral-400` 会随文件而异。后者与 shadcn
的 `--accent` 槽位**不冲突**（`bg-accent` 与 `bg-accent-600` 是两个 token），但读代码的人
要知道：**`accent-N` 是色阶、`accent` 是悬停底**。这句话写进 `index.css` 顶部注释。

**圆角三档换值**：`--radius-sm/md/lg = 4/8/14px`。Organic 的「小控件是药丸、
`rounded-full` 写在组件里」**整条作废**：Nocturne 没有药丸，按钮 8、输入框 8、标签 6、
弹窗 14。全站 `rounded-full` 只剩头像（28px 圆）、单选圆点、加载圈三处，做成白名单守卫。

**阴影三档**照抄；**字体**见第四节；**状态色**见第七节。

**根元素加 `color-scheme: dark`**：不加的话 `<input type=date>` 的选择器、滚动条、
`<textarea>` 的 resize 角都是白的 —— 这是浏览器画的，token 管不到。

---

## 二、shadcn 变体重写清单：23 个文件，按「Organic 标记数」排序

`grep -c "rounded-full|bg-well|accent-2|animate-|border-muted"` 在 `components/ui` 下命中 23 个
文件。每一个都要过一遍，但工作量集中在前五个：

| 文件 | 要改的 | Nocturne 对应 |
|---|---|---|
| `button.tsx` | 五个变体全部、尺寸、圆角、字体、禁用态 | `.btn`：14px Inter 500、8px 圆角、`padding 5.6px 10px`；**default = accent 描边**（`border-primary text-primary bg-transparent hover:bg-primary/12 active:bg-primary/22`）；secondary = divider 描边 + `hover:bg-secondary`；ghost = accent 字无边；destructive = 红字红描边 ghost；icon 尺寸 36 / 30 / 28 三档；`disabled:opacity-45` |
| `dialog.tsx` / `alert-dialog.tsx` | 容器、遮罩、底栏、关闭钮、**去动画**、去角落装饰圆 | surface + `shadow-lg` + 14px + `p-[22px_24px] gap-4`；遮罩 `color-mix(neutral-900 50%)`；底栏**不再是 `-mx-8 bg-well` 的带子**，改右对齐 `gap-2`；✕ 28px ghost；AlertDialog 左缘 `shadow-[inset_2px_0_0_var(--destructive-line)]` |
| `input-group.tsx` / `input.tsx` / `textarea.tsx` | `.input` | surface 底、divider 描边、8px、36px 高（`size` 变体给 40 / 34 / 32）；`hover:border-[color-mix(text 45%)]`、`focus-visible:border-primary outline-offset-0` |
| `badge.tsx` | `.tag` | 11px、`px-2.5 py-[3px]`、6px 圆角、`tracking-[.02em]`；变体 accent（`bg-accent-800 text-accent-100`）/ neutral（`bg-neutral-800 text-neutral-100`）/ outline（accent 描边字） |
| `select.tsx` | 触发器 + 面板 | 触发器 = `.input`；面板 surface + `shadow-lg` + 8px；项悬停 `bg-accent`；**去动画** |
| `tabs.tsx` / `toggle-group.tsx` / `toggle.tsx` | `.seg` | divider 描边盒、`px-3 py-[7px]` 13px、项间 1px 分隔、选中 = `text-primary shadow-[inset_0_0_0_1px_var(--primary)]`、悬停 `bg-secondary` |
| `table.tsx` | `.table` | 表头 11px 大写 `.08em` 60% 文本色、**不再有表头底色**；行线用 `--border-muted`（Nocturne 的渐隐行线在 `TableFrame` 上画一次） |
| `popover` / `dropdown-menu` / `context-menu` / `hover-card` / `tooltip` | 面板 | surface + `shadow-md`（tooltip）/ `shadow-lg`、8px、**去动画** |
| `checkbox.tsx` | 15px 方 | 1.5px `neutral-600` 描边、4px 圆角、选中 accent 底 + bg 色勾 |
| `radio-group.tsx` | `.radio` | 16px 圆、1.5px divider、选中 accent 底 + `inset 0 0 0 4px bg` |
| `alert.tsx` | 两种 | destructive = 红字红描边**不填充**；成功横幅 = `accent-900` 底 `accent-200` 字 |
| `card.tsx` | `.card` | surface、8px、`shadow-sm`；内边距由调用页给（18–24px 各屏不同） |
| `progress` / `skeleton` / `spinner` / `sonner` / `drawer` | 换色阶 | `neutral-900` 轨道、4px 进度条；spinner 保留 `animate-spin`（见第五节） |

**去动画的实现**：`index.css` 去掉 `@import "tw-animate-css"`，`package.json` 卸掉它；
9 个组件里的 `data-[state=open]:animate-in …` 整串删除。Radix 在没有动画类时即开即关，
不需要额外配置。

**不新建自定义组件。** 原型每一个形制都有 shadcn 对应物：`.seg` → `ToggleGroup`
（流转动作已经在用）、`.radio` → `RadioGroup`（导出范围已经在用）、确认弹窗的红色
左缘 → `AlertDialog` 加 `className`。实施中若发现例外，按章程原则 III 先问。

---

## 三、feature 层要动的文件：按 `design/screen-map.md` 逐屏

交接文档的 `github.md` 已经把 13 屏对到源文件。在那张表之外还要动的**共用件**：

- `features/common/MasterDetail.tsx`：左栏 `300 → 280px`。三个调用方零改动（这是 024
  定的骨架标准，本轮正好再测一次）。
- `features/common/Rail.tsx` / `RailRow.tsx` / `TreePager.tsx`：搜索框 32px、行 `padding 6px 10px`
  + `10 + depth×16` 缩进、激活态 = `--selected` 底 + `accent-200` 字、右端数量 12px `neutral-500`。
- `features/common/PageHeader.tsx`：`h1` 26px Inter 500，右端动作 `gap-2.5`。
- `features/common/Pane.tsx` / `Fact`：右栏 `.card padding 20px 24px gap 20px`；事实 `dl`
  底 `--well` 8px 圆角 `padding 14px 16px`。
- `features/common/TableFrame.tsx`：Nocturne 的渐隐行线在这里画；翻页条 30px 按钮。
- `features/common/ListToolbar.tsx`：搜索框 260px 带放大镜 `pl-[30px]`；筛选控件 34px。
- `features/assets/ActionBar.tsx`：`.dialog` 风格浮层 `padding 8px 8px 8px 16px`、
  「已选 N 台」`accent-300`、删除红 ghost。
- `features/overview/DistributionBar.tsx`：`96px 1fr 40px`、6px 轨道 `neutral-900`。
- `features/common/Hint.tsx`：16px 圆「?」。
- `features/common/Logo.tsx`：立方体线框 + 1px accent 描边方块（28px 导航 / 36px 登录）。
- `features/statuses/StatusBadge.tsx`：`.status-chip` 换新三值。
- `features/transfers/MovementCell.tsx`：动作 Badge 用 neutral 变体。
- `routes/AppShell.tsx`：壳 `216px minmax(0,1fr)`、导航三组、激活竖线、底部账号行、
  **折叠**（新增 `useNavCollapsed` 钩子，`localStorage` 键 `nexus.nav.collapsed`）。
- `routes/Login.tsx`：整页按第 1 屏重写。

---

## 四、图标与字体：替换面的实际数字

**图标**：lucide 在 53 个文件里出现，**24 个不同图标名** + 一个类型 `LucideIcon`，
外加 `navIcons.ts` 的 11 条映射（10 条路由 + 兜底）。对照表（Phosphor 线性 = `weight="regular"`）：

| lucide | Phosphor | 备注 |
|---|---|---|
| `AlertCircleIcon` ×25 | `WarningCircle` | 拒绝提示 |
| `CheckIcon` ×8 | `Check` | |
| `ChevronRight/Down/Up/LeftIcon` | `CaretRight/Down/Up/Left` | Phosphor 的 Chevron 叫 Caret |
| `Trash2Icon` | `Trash` | |
| `PlusIcon` | `Plus` | |
| `CircleIcon` | `Circle` | |
| `SearchIcon` | `MagnifyingGlass` | |
| `PrinterIcon` | `Printer` | |
| `InfoIcon` | `Info` | |
| `HelpCircleIcon` | `Question` | |
| `ExternalLinkIcon` | `ArrowSquareOut` | |
| `CopyIcon` | `Copy` | |
| `CalendarIcon` | `CalendarBlank` | |
| `XIcon` | `X` | |
| `RefreshCwIcon` | `ArrowsClockwise` | |
| `LogOutIcon` | `SignOut` | |
| `Loader2Icon` | `CircleNotch` | 配 `animate-spin` |
| `DownloadIcon` | `DownloadSimple` | |
| `ChartColumnIcon` | `ChartBar` | |
| `ArrowRight/LeftIcon` | `ArrowRight/Left` | |
| `type LucideIcon` | `type Icon` | `@phosphor-icons/react` 导出 |
| 品牌 | `Cube` | 新 |

`navIcons.ts` 的 11 条在实施时逐条对（表在 tasks 里）。Phosphor 组件接受 `className`
与 `size`；现有调用写的是 `className="size-4"`，保留即可。`aria-hidden` 照旧。

**字体**：
- 卸：`@fontsource/caprasimo`、`@fontsource-variable/figtree`。
- 加：`@fontsource-variable/inter`（5.3.0，一个可变文件覆盖 100–900）。
- `@fontsource/noto-sans-sc` 已在，**多引一个 `500.css`**（子集化后约 +1.5MB woff2）。
- `fonts.css` 重写；`public/fonts/` 的许可证换成 Inter 的 OFL；`vite.config.ts` 的
  `dropWoffFallback` 不动。
- `--font-sans` 与 `--font-heading` 都指向 Inter；`font-heading` 这个 Tailwind 类**保留名字**
  （调用处不改），值变成「Inter 500」。

**依赖变更的章程判定**：图标库与字体不是章程「技术栈约束」里列出的框架级依赖
（列的是 Vite / React / router / Tailwind / shadcn / TanStack / RHF+zod），
**不需要修订章程**；按原则 I 在 PR 描述里说明理由与被拒绝的替代（保留 lucide 统一线宽——
被拒，因为原型的每个图标形状都会变成像素差异）。

---

## 五、守卫：改两个、加一个、DOM 测试补三处

**改**：
- `contentColumn.test.ts`：白名单的**含义**变了——从「只有这几处允许有宽度」变成
  「这几处的宽度来自原型」。测试形状不变（源码不变量 + 带理由的白名单），
  白名单扩到原型给了数字的每一处：`AssetDetail` 1100、`Statuses` 搜索框 360、
  `ListToolbar` 260、`Assets` 备注列 220、`Login` 420、`SearchSelect` 24rem。每条理由
  引用 `design/handoff.md` 的段落。
- `favicon.test.ts`：钉的 token 从 `--primary/--background/--accent-2` 变成 **`--primary`
  与 `--background`**（立方体线框只用这两色）。

**加** `web/tests/nocturne.test.ts`（源码不变量，一个文件九条）：
1. `index.css` 的八个 `.status-*` 三值 = 交接文档的 24 个 oklch（逐字）。
2. `src/**` 零命中 `animate-in|animate-out|fade-in-|fade-out-|zoom-in-|zoom-out-|slide-in-|slide-out-`
   —— **不是裸 `animate-`**：`animate-spin` 是加载圈，要留。
3. `src/**` 零命中 `lucide-react`。
4. `src/**` 零命中 `dark:` 与 `.dark`。
5. `index.css` 与 `package.json` 零命中 `tw-animate-css`。
6. `src/routes` 与 `src/features` 零命中六位十六进制色（017 说「收口时会 grep」——
   现在做成测试）。
7. `fonts.css` 与 `index.css` 零命中 `googleapis|gstatic`；零命中 `Caprasimo|Figtree`。
8. `rounded-full` 白名单：头像、单选圆点、加载圈三处；其余零命中。
9. `--radius-2xl` 与 `--primary-hover` 不存在（两个 Organic 专有 token 不许悄悄回来）。

**DOM 测试**：
- `navCollapse.test.tsx`（新）：点品牌块 → 导航项文字不可见、每项 `title`；再点展开；
  `localStorage` 写入并在重新挂载后读回；`max-md` 下开关不参与（源码断言）。
- `login.test.tsx`（改）：字段与按钮的可达性断言不变，去掉对旧装饰圆的断言。
- `dialogTrack.test.ts`：**不动**——它守的是 `grid-cols-[minmax(0,1fr)]` 与 `ToggleGroup`
  的 `flex-wrap`，两条在 Nocturne 下仍成立（弹窗底栏不再是带子，但轨道那条与带子无关）。
- 现有 507 条里凡是断言了 Organic 类名的（`rounded-full`、`bg-well`、`font-heading`），
  在改到那一屏时一并改；按 grep 结果预估不超过十处。

---

## 六、走查怎么做：Playwright MCP + 一份可重复的脚本片段

`web/node_modules` 里没有 `playwright`，而本会话一直在用的 **Playwright MCP** 可以
`page.screenshot({ path })` 写到任意绝对路径。不为走查引入一个 150MB 浏览器下载的
devDependency；走查用 MCP 做，**步骤与每屏的准备动作写进 `quickstart.md`**，
让下一个人能照做。

- 视口 **1440×900**（原型画布）。
- 原型侧：`python3 -m http.server` 起在 `design/`，同一个浏览器开 `prototype.dc.html`，
  用它自带的导航切到对应屏，同样截图。**两张并排**放进 `walkthrough/`。
- 每屏一条记录写进 `quickstart.md` 的差异表：`屏 | 项 | 原型值 | 实测值 | 处置`。
  处置只有三种：已改 / 引用决策 21x 不改 / 报告（交接文档自身的问题）。
- 焦点环用真键盘：`page.keyboard.press("Tab")` 是真键盘事件，能触发 `:focus-visible`；
  `element.focus()` 不能。对比度用 computed color 算 WCAG。
- 药丸不换行：English 下对 `button, [data-slot=badge], th, [role=radio], label`
  量 `scrollWidth <= clientWidth`。

---

## 七、两处规则在新调色板上怎么读

**焦点环**：017 用 `accent-700` 而不是主色，是因为陶土橙在奶油底上只有 3.03。
Nocturne 的 accent `#9184d9` 在 bg `#161826` 上是 **5.46:1**、在 surface `#232532` 上是
**4.71:1**（按 WCAG 相对亮度算），两处都过 3:1 —— 所以 `--ring` 可以直接就是动作色，
与交接文档「`:focus-visible` 2px accent」一致。**017 那条「环不是主色」的规则在深色
地面上不再必要**，web-forms.md 里那段要改写而不是保留。

**颜色分工**：017 的三句话是「陶土橙 = 动作，八个 `.status-*` = 状态，沙绿 = 数量与装饰」。
交接文档里类别分布条用 **`accent-600`**（`#796cbf`）—— 是动作色的一个暗步，不是动作色本身。
Nocturne 设计系统指南写的正是这条：「on this dark ground use the dark steps (700–900)
for tinted fills… 500 as the role's base」。所以分工改写为：

> **`--primary`（`#9184d9`）只画动作；`accent-600…900` 是填充与装饰；八个 `.status-*` 只画
> 状态；`neutral-*` 画数量与弱化。**

审计的前后值仍靠标签与左侧竖线（`neutral-700` / `accent`）区分，不靠红绿。

---

## 附：本轮不碰

- **服务端**一行不动；`openapi.yaml` 不动；`users.theme` 列继续不读。
- **右键菜单**（`ContextMenu`）原型没画，只换皮。
- **窄屏**只查现有塌陷逻辑仍工作，不做像素对照。
- **打印页**走 zenith-printer，纸面样式与本轮无关。
