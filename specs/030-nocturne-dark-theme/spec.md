# Feature Specification: Nocturne 深色系统，像素级换皮

**Feature Branch**: `030-nocturne-dark-theme`

**Created**: 2026-09-19

**Status**: Draft

**Input**: 把 Organic 浅色语言换成 Nocturne 深色系统，像素级还原交接原型的全部 13 屏 + 13 弹窗。推翻 017「只有一套浅色」与决策 135「内容列没有宽度规则」。纯前端，服务端零改动。

> **语言规范**（章程原则 V）：本规格的全部正文内容必须使用**中文**撰写。
> 仅以下内容保留英文：API 路径与参数名、字段 key、错误码 `error.code`、
> 数据库标识符。用户可见文案（UI 文本、字段 label、`error.message`）使用中文。

---

## 这一轮是什么

017 定下的 Organic（奶油底、陶土橙、Caprasimo 标题、药丸控件）在开发者看来**不像一家
科技公司的内部工具**。开发者在 Claude Design 里用 Nocturne 深色系统重做了整套界面 ——
13 个路由页、13 种弹窗 —— 并交来一份交接文档，里面每一屏、每一弹窗的 px 值、token、
状态色都写死了。

**这一轮是把那份交接文档落到现有代码库里，按像素还原。** 不是改流程、不是改数据、
不是改信息架构：交接原型描述的主从两栏、三组导航、标题行右上角主操作，正是 024–028
做出来的形状。变的是**皮**，以及几处可数的版面数字。

**两处推翻的既有决策**，是这一轮唯一动到「规则」的地方：

- **017「只有一套浅色」** → 只有一套深色。规则的形状（没有切换、没有第二套、`users.theme`
  不读）原样保留，只把颜色换掉。
- **决策 135「内容列没有宽度规则」** → 列宽、内边距、字号以原型为准。这条是开发者在
  被提示冲突后确认的（见「本轮裁定」决策 215）。

**几处原型撞上硬规则的地方，硬规则赢**，逐条见决策 217–220。像素还原上唯一一处
**有意少画东西**的，是字段页右栏（决策 218）。

**服务端零改动。** 原型里出现而现状界面没有的三处数据 —— 账号「登录方式」、
角色「账号数」、状态「N 台设备・历史 M 条」—— 服务端都已经在返回。

---

## 输入与它们的效力

四份设计输入入库到 `specs/030-nocturne-dark-theme/design/`：

| 文件 | 是什么 | 效力 |
|---|---|---|
| `design/handoff.md` | 交接文档：每屏每弹窗的版面数字、token、状态色、交互 | **每一个 px 值都有约束力**；与本规格冲突处以本规格「本轮裁定」为准 |
| `design/prototype.dc.html` | 13 屏 + 13 弹窗的可点击原型（示例数据为编造） | 像素对照的**参照物**；示例数据、示例字段不构成需求 |
| `design/nocturne-ds/styles.css` | Nocturne 的 token 与组件层 | token 值的**唯一来源**；`.btn/.tag/.seg` 等类名不落地，对应到 shadcn 变体 |
| `design/nocturne-ds/readme.md` | 设计系统指南（方向、色、字、状态） | 设计意图的解释；与 handoff 冲突处以 handoff 为准 |
| `design/screen-map.md` | 屏幕 ↔ 仓库源文件对照表 | 实施时的导航图 |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 打开系统，看到的是一套完整的深色界面 (Priority: P1)

任何人登录进来，从登录页到壳、导航、每一个页面，看到的是同一套 Nocturne：近中性的
蓝灰地面、Inter 中等字重、8px 圆角、accent 只作线与光晕而非大面积填充、分隔线两端
渐隐。**没有任何一屏还是奶油色的。** 没有主题切换，设置里没有主题项。

**Why this priority**: 这是这一轮存在的理由。一屏深色一屏浅色的中间态不能到用户手上，
所以它必须作为整体验收，也是为什么版本号要等整轮完成再定。

**Independent Test**: 中文界面下逐屏截图，与 `design/prototype.dc.html` 的对应屏并排，
每一处版面数字（间距、字号、圆角、列宽）对得上；`grep` 全站无浅色 token 残留。

**Acceptance Scenarios**:

1. **Given** 未登录，**When** 打开根地址，**Then** 登录页是原型第 1 屏：深色地面、右侧
   accent 描边圆与渐隐线、左对齐 420px 卡片区、36px 品牌块、40px 高输入框与按钮。
2. **Given** 已登录，**When** 进入任一路由，**Then** 壳是 `216px + 内容区` 两列、各自滚动；
   导航三组（无标题组 / 配置 / 权限与审计）、激活项左缘 2px accent 竖线带光晕。
3. **Given** 停在任一页，**When** 打开设置弹窗，**Then** 只有语言、API 密钥、接口文档三项，
   **没有主题项**。
4. **Given** 浏览器系统主题为浅色，**When** 打开系统，**Then** 仍是深色 —— 界面不跟随
   `prefers-color-scheme`。

---

### User Story 2 - 十三个页面逐屏与原型一致 (Priority: P1)

概览、资产列表、设备详情、类别、字段、型号、状态、持有方、账号、角色、审计（操作 /
流转）、登录 —— 每一屏的标题行、筛选行、表格、分页、主从两栏、事实带、卡片都按原型的
版面数字画出来。**四个主从页的左栏是 280px**（原为 300px），内容区 `padding: 26px 36px
64px 32px`，正文 15px/1.55。

**Why this priority**: 与故事 1 同级 —— 故事 1 是「整体是深色」，故事 2 是「每一屏都对」。

**Independent Test**: 每一屏一张截图存档到 `walkthrough/`，与原型并排；差异逐条写进
`quickstart.md`，每条差异要么改掉、要么有一句为什么不改（只允许「本轮裁定」里列出的那些）。

**Acceptance Scenarios**:

1. **Given** 概览页，**When** 查看三张分布卡，**Then** 是 `.card` 自适应网格
   `minmax(300px,1fr)`、分布行 `96px 1fr 40px` 三栏、6px 轨道；状态用状态色 `bar`、类别用
   `accent-600`、负责人用 `neutral-500`。
2. **Given** 资产列表有筛选与选中行，**When** 查看，**Then** 筛选栏控件 34px 高、选中行底
   `color-mix(accent 8%)`、行操作悬停才显示（`opacity .12s`）、批量栏是底部悬浮的
   `.dialog` 风格浮层。
3. **Given** 类别页选中一个类别，**When** 查看，**Then** 左栏 280px、树行
   `padding-left: 10 + depth×16`、右栏 `.card padding:20px 24px`、事实 `dl` 底为 `--color-bg`
   8px 圆角。
4. **Given** 字段页选中一个字段，**When** 查看右栏「绑在哪些目标上」表，**Then** 有目标类型 /
   目标 / 必填三列，**没有「解绑」列，表下没有「＋ 绑定到类别」**（决策 218），
   `bindElsewhere` 指路文案仍在。
5. **Given** 审计页与角色页，**When** 查看页头与表下，**Then** 没有常显的说明文字，
   说明在页头 ⓘ 的悬停里（决策 219）。
6. **Given** 资产筛选栏的「全部类别」，**When** 点开，**Then** 弹出的是可搜索的面板
   （surface 底、`--shadow-lg`），不是系统菜单；触发器本身按原型 `.input` 34px 画（决策 217）。

---

### User Story 3 - 十三个弹窗一个形制 (Priority: P2)

设置、流转、状态、编辑类别、录入设备、账号、角色、变更内容、确认、批量导入、打印标签、
导出、表达式帮助 —— 全部是同一个容器：surface 底、`--shadow-lg`、14px 圆角、
`padding 22px 24px`、20px 标题、右上 28px ✕、底部动作右对齐；**主动作是 accent 描边而非
填充**；危险动作红色 ghost 靠左。宽度按交接文档的表逐个定（440–680）。

**Why this priority**: 弹窗是每一个写操作的入口，形制不一致比某一屏配色不对更显眼；
但它依附于故事 1 的 token 已就位。

**Independent Test**: 每个弹窗一张截图存档；容器四项（底色、阴影、圆角、内边距）与宽度
用 Playwright 量 computed style。

**Acceptance Scenarios**:

1. **Given** 任一弹窗，**When** 打开，**Then** **即开即关，没有淡入缩放**（决策 220）；
   点遮罩或 ✕ 关闭；`Esc` 关闭。
2. **Given** 确认弹窗（删除类别 / 删除设备 / 停用账号……），**When** 打开，**Then** 容器
   左缘 2px 红色内阴影，`role=alertdialog`，「请输入 `<phrase>` 以确认」+ 复制按钮，
   输入匹配前主按钮禁用，主按钮红描边。
3. **Given** 录入设备弹窗，**When** 选定一个类别，**Then** 表单字段由**该类别的 schema**
   生成（决策 222），不是原型里的「序列号 / MAC / 购入日期」示例。
4. **Given** 流转弹窗里的持有方下拉，**When** 用滚轮，**Then** 列表能滚（029 修过的那条
   在新皮上仍成立）。

---

### User Story 4 - 深色地面上仍然分得清状态、动作与焦点 (Priority: P1)

017 的「颜色分工」在新调色板上原样成立：**八个状态色只画状态**（标签、分布条、行内
`.tag`），**accent 只画动作**（主按钮描边、链接、激活项、焦点环），**中性色画数量与
装饰**。审计的前后值仍靠标签与左侧竖线区分，不靠红绿。键盘使用者在任何底色上都能
看见焦点环。

**Why this priority**: 这是可用性而非美观 —— 深色地面上对比度更容易失守，而
「状态色用去画了不是状态的东西」是 017 就明文禁止的。

**Independent Test**: 八个状态色槽位的 `bg/fg/bar` 与交接文档一字不差（源码不变量）；
真键盘 Tab 走一遍每一屏，焦点环可见；焦点环颜色对 `--color-bg` 与 `--color-surface`
的对比度各 ≥ 3:1（量 computed color）。

**Acceptance Scenarios**:

1. **Given** 状态「已签出」为 amber 槽位，**When** 在概览、列表、详情、审计四处看它，
   **Then** 四处的标签底 / 字 / 条色都是 `oklch(0.36 0.07 75) / oklch(0.90 0.12 80) /
   oklch(0.72 0.14 75)`。
2. **Given** 任一页面，**When** 用真键盘 Tab 到一个按钮，**Then** 2px accent 外框可见
   （`:focus-visible`，程序化 `.focus()` 不算）。
3. **Given** 变更内容弹窗，**When** 看「变更前 / 变更后」，**Then** 前者左缘 2px neutral-700
   边、后者左缘 2px accent 边，**没有红绿**。
4. **Given** 危险动作（删除），**When** 看按钮，**Then** 红色只作文字与描边
   （`oklch(0.72 0.12 20)` / `oklch(0.64 0.16 20)`），不作填充。

---

### User Story 5 - 导航可以折叠成只有图标 (Priority: P2)

常用这套系统的人在宽表格页想要更多横向空间。点一下左上角的品牌块，导航折叠为 60px
仅图标；再点一下展开。这个选择**记在这台浏览器上**，下次打开仍然折叠。折叠态下每个
图标悬停有文字说明。

**Why this priority**: 交接文档把它列为一个开关而非一屏，开发者裁定要做；它不阻塞
任何一屏的验收，所以是 P2。

**Independent Test**: DOM 测试：点品牌块后导航项文字不可见、每项带 `title`；再点展开；
刷新后状态保持（`localStorage`）。实机量导航宽度 60px / 216px。

**Acceptance Scenarios**:

1. **Given** 展开态（216px），**When** 点品牌块，**Then** 导航变 60px，只剩图标，每个
   图标 `title` 为该项文字；内容区随之变宽。
2. **Given** 折叠态，**When** 刷新页面，**Then** 仍是折叠态。
3. **Given** 折叠态，**When** 视口缩到 `md` 以下，**Then** 沿用现有的窄屏塌陷逻辑，
   折叠开关不参与。
4. **Given** 折叠态，**When** Tab 到某个导航项，**Then** 焦点环可见，且激活项的左缘
   accent 竖线仍在。

---

### User Story 6 - 英文界面不破版 (Priority: P3)

切到 English，每一个药丸、标签、表头、分段项、复选标签**不换行**，表格列不溢出，
弹窗底栏不挂到圆角外。原型是中文的，英文没有像素参照物，所以这一条**只查不破版，
不做像素对照**。

**Why this priority**: 两语是章程要求；但英文没有原型，验收尺子只能是「没坏」。

**Independent Test**: English 下 Playwright 量每个药丸类元素 `scrollWidth ≤ clientWidth`、
弹窗底栏对面板 ±1px。

**Acceptance Scenarios**:

1. **Given** English，**When** 打开流转弹窗，**Then** 五个动作药丸不换行、不竖排（换行
   走 `flex-wrap`，不是药丸内部折行）。
2. **Given** English，**When** 看任一表格表头，**Then** 表头 11px 大写 `letter-spacing .08em`
   且单行。

---

### Edge Cases

- **中英混排的标题**：Inter 500 里出现汉字 —— Noto Sans SC 必须有 500 字重，否则汉字
  落到 400、一粗一细（`font-synthesis-weight: none` 不合成）。决策 224。
- **折叠导航里的长名字**：`title` 承载全文；激活态竖线在 60px 下仍画在左缘 `-12px`。
- **280px 左栏里的超长名称**：028 的「左栏不得超限」规矩在 280px 上要重新实机量
  一遍（`min-w-0` 链）；`Ellipsis` 悬停补全照旧。
- **`prefers-reduced-motion`**：动画全删后自然满足；不需要专门处理。
- **深色下的原生控件**：`<input type=date>`、`<textarea>`、滚动条 —— 系统会按 `color-scheme`
  画；根元素必须声明 `color-scheme: dark`，否则日期选择器与滚动条是白的。
- **状态色 slate 在 surface 上**：最暗的槽位，标签底 `oklch(0.34 0.02 260)` 对 surface
  `#232532` 的可辨性要实机确认，不够就是交接文档的问题，报告而不是私自调。
- **打印标签**：打印走 zenith-printer，纸面样式与本轮无关；弹窗本身按形制换皮。
- **登录页的 Google 按钮**：`.btn-secondary.btn-block`；OIDC 未配置时的隐藏逻辑照旧。
- **错误横幅与拒绝**：`Alert destructive` 的红只作文字 / 描边 / 左缘，不作填充。
- **旧 logo 的缓存**：favicon 三个文件重出后文件名不变，浏览器缓存可能保留三圆一段时间；
  接受。

---

## Requirements *(mandatory)*

### Functional Requirements

**主题与 token**

- **FR-001**: 界面 MUST 只有一套深色主题：没有 `.dark` 类、没有 `dark:` 工具类、没有主题
  切换控件、设置里没有主题项；`users.theme` 不读。不跟随 `prefers-color-scheme`。
- **FR-002**: 全部颜色、字号、间距、圆角、阴影 MUST 来自 Nocturne 的 token（地面 `#161826`、
  表面 `#232532`、文本 `#e9e9ed`、accent `#9184d9`、中性与 accent 各 100–900 色阶、
  `--radius-sm/md/lg = 4/8/14px`、`--shadow-sm/md/lg` 三档），值与 `design/nocturne-ds/styles.css`
  一字不差。
- **FR-003**: 八个状态色槽位（slate / green / blue / amber / red / violet / teal / rose）的
  `bg / fg / bar` 三值 MUST 与交接文档给出的 oklch 一字不差；危险文字 / 描边为
  `oklch(0.72 0.12 20)` / `oklch(0.64 0.16 20)`。
- **FR-004**: 颜色分工 MUST 保持 017 的规则：状态色只画状态，accent 只画动作，中性色画
  数量与装饰；`src/routes` 与 `src/features` 内六位十六进制色零命中。
- **FR-005**: 根元素 MUST 声明 `color-scheme: dark`，使原生日期选择器、滚动条、`<select>`
  的系统面板按深色画。

**壳与导航**

- **FR-006**: 壳 MUST 是 `216px minmax(0,1fr)` 两列、`100vh`、两列各自滚动；导航
  `padding 18px 12px 14px`、右侧 1px divider、自上而下 surface → bg 60% 的渐变底。
- **FR-007**: 导航 MUST 分三组（无标题 / 配置 / 权限与审计），组标题 11px
  `letter-spacing .06em`；导航项 `padding 7px 10px`、8px 圆角、13.5px、16px 线性图标；
  激活项文字 `accent-200`、底 `color-mix(accent 12%)`、左缘 2px accent 竖线带
  `0 0 10px accent` 光晕；「资产」在设备详情页保持激活。
- **FR-008**: 品牌块 MUST 是 28px 方块（8px 圆角、1px accent 描边、16px 立方体线框）+
  「Nexus **Assets**」；点击折叠 / 展开导航（60px 仅图标，`title` 提供文字），状态存
  `localStorage`；窄屏 `max-md` 沿用现有塌陷，折叠开关不参与。
- **FR-009**: 导航底部 MUST 有顶边渐隐分隔、账号按钮（28px 圆头像 `accent-900` 底
  `accent-200` 字、姓名 13px + 角色 11px）打开设置弹窗、30px 退出图标按钮。
- **FR-010**: 内容区 MUST 是 `padding 26px 36px 64px 32px`、内部 `grid gap 22px`（概览 34px）；
  页面标题 `h1` 26px Inter 500，同一行右端放页面操作按钮 `gap 10px`。

**字体与图标**

- **FR-011**: 字体 MUST 为 Inter（标题 500 / 正文 400）+ Noto Sans SC **400 / 500 / 700**，
  全部自托管；产物零处 `fonts.googleapis.com` / `fonts.gstatic.com`；Figtree、Caprasimo 卸除。
  正文 15px / 1.55；等宽为 `ui-monospace, SFMono-Regular, Menlo, monospace` 12.5–13px。
- **FR-012**: 图标 MUST 全部为 Phosphor 线性风格；lucide 卸除，源码零处 `lucide-react`。
  导航 25 条映射逐个核对含义。
- **FR-013**: `logo.svg`、`favicon.ico`、`apple-touch-icon.png` MUST 重出为立方体线框标；
  三者颜色取自 accent 与 bg token。

**页面（13 屏）**

- **FR-014**: 登录页 MUST 按交接文档第 1 屏：`radial-gradient(1200px 600px at 85% 30%,
  accent-900, transparent 60%)` 叠 bg、右侧两个 1px 描边圆（accent-700 圆带 80px 外发光）
  与一条渐隐水平线、左对齐 `max-width 420px` 卡片区、36px 发光品牌块、28px 标题、
  40px 输入框与按钮、「或」渐隐分隔。上周的登录页不保留。
- **FR-015**: 概览 MUST 按第 2 屏：三张 `.card.elev-sm`（`padding 18px 20px`）自适应网格
  `minmax(300px,1fr) gap 16px`；分布行 `96px 1fr 40px`、6px 轨道、填充色按状态 / accent-600 /
  neutral-500；最近流转四列表 + 5/10/20 条选择。
- **FR-016**: 资产列表 MUST 按第 3 屏：筛选行 `flex wrap gap 8px`、搜索框 260px 带放大镜、
  筛选控件 34px 高、右端范围文字；表格列序与样式（复选 15px、编号等宽 13px、状态 `.tag`、
  备注 `max-width 220px` 省略、行操作悬停显示）；选中行底 `color-mix(accent 8%)`；底部
  20/50/100 每页；批量栏底部悬浮 `.dialog` 风格。**筛选控件保持 `Select` / `SearchSelect`，
  只换触发器的皮**（决策 217）。
- **FR-017**: 设备详情 MUST 按第 4 屏：`max-width 1100px gap 30px`、编号 `h1` 30px + 状态
  `.tag`、四项事实卡、两列属性 `minmax(340px,1fr) gap 0 40px`、每行底部渐隐线、右侧至多一个
  `.tag-outline`（计算项 › 唯一 › 来自厂商 / 来自型号）、流转历史三列表。
- **FR-018**: 类别、字段、型号、持有方四个主从页 MUST 按第 5–7、9 屏：左栏 280px、搜索框
  32px、树行 `padding 6px 10px` + 深度缩进、右栏 `.card.elev-sm padding 20px 24px gap 20px`、
  事实 `dl` 底 bg 8px 圆角。**字段页右栏不画「解绑」列与「＋ 绑定到类别」**（决策 218）。
- **FR-019**: 状态、账号、角色、审计四个表格页 MUST 按第 8、10–12 屏：标题行右上主操作、
  筛选行、`.table`、行可点开编辑或详情；**审计与角色不画常显说明**（决策 219）。
- **FR-020**: 表格 MUST 统一 `.table` 形制：表头 11px 大写 `letter-spacing .08em` 60% 文本色，
  行线 8% 文本色；列宽以原型渲染为准（决策 215）。

**弹窗（13 个）**

- **FR-021**: 全部弹窗 MUST 共用一个容器：遮罩 `color-mix(neutral-900 50%)`、surface 底、
  `--shadow-lg`、14px 圆角、`padding 22px 24px gap 16px`、20px 标题、右上 28px ✕、底部动作
  右对齐、主动作 accent **描边**、危险动作红色 ghost 靠左；宽度按交接文档表（440–680）。
- **FR-022**: 弹窗与弹出面板 MUST 没有进出场动画；全站仅保留行操作 `opacity .12s` 与
  导航 `transition-colors`；源码零处 `animate-`。
- **FR-023**: 确认弹窗 MUST 为 `role=alertdialog`、左缘 2px 红色内阴影、type-to-confirm
  + 复制按钮、匹配前主按钮禁用、主按钮红描边。
- **FR-024**: 录入设备弹窗的字段 MUST 由类别 schema 动态生成；原型示例字段不构成需求。
- **FR-025**: 表单 MUST 用双列 `1fr 1fr gap 12px`、`.field > label` 12px 70% 文本色；
  下拉、复选、单选、分段控件仍为 shadcn 组件（`Select`/`SearchSelect`、`Checkbox`、
  `RadioGroup`、`ToggleGroup`），按 Nocturne 状态样式重写变体。

**交互状态**

- **FR-026**: 悬停 / 按下 / 焦点 / 禁用 MUST 按 Nocturne：悬停与按下为 accent 或文本色的
  7–22% 混色；`:focus-visible` 为 2px accent 外框 `outline-offset 2px`，在 bg 与 surface 两种
  底上对比度各 ≥ 3:1；禁用 45% 不透明度。
- **FR-027**: 中英两语下每一个按钮、标签、表头、分段项、复选标签 MUST `white-space: nowrap`。

**守卫与文档**

- **FR-028**: 以下源码不变量 MUST 存在并绿：`animate-` 零命中、`lucide-react` 零命中、
  `dark:` 零命中、六位十六进制零命中（routes/features）、Google Fonts 零命中（产物）、
  八个状态色三值与交接文档一致、logo 三文件颜色与 token 一致。`contentColumn.test.ts`
  改写为「以原型为准」的新守卫；`searchableSelects`、`dialogTrack`、`menuDisabled`、`i18n`、
  `masterDetail` 五个守卫不动。
- **FR-029**: 走查证据 MUST 存档：中文界面 13 屏 + 13 弹窗各一张截图到 `walkthrough/`，
  与原型并排；差异逐条写进 `quickstart.md`。英文只查不破版，不存档。
- **FR-030**: `docs/rules/web-forms.md`「视觉（017 Organic）」MUST 整节改写为
  「视觉（030 Nocturne）」；`docs/rules/web-tables.md` 版面数字一节（018）按新 px 值改写；
  两处都要写明推翻了什么、为什么。
- **FR-031**: 服务端 MUST 零改动；合约 `openapi.yaml` 不动。

### Key Entities

本轮不涉及数据模型变化。界面上出现的所有数据来自既有端点。

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `walkthrough/` 里有 **26 张**截图（13 屏 + 13 弹窗），每张在 `quickstart.md`
  里有一行对照结论；差异条目里每一条要么已改掉、要么引用「本轮裁定」中的某条决策。
- **SC-002**: 七个 `grep` 守卫全部为零命中：`animate-`、`lucide-react`、`dark:`、
  routes/features 六位十六进制、产物 Google Fonts、`.dark`、`Caprasimo|Figtree`。
- **SC-003**: 八个状态色槽位 × 三值 = **24 个 oklch 值**与交接文档逐字相等（源码不变量）。
- **SC-004**: 焦点环颜色对 `--color-bg` 与 `--color-surface` 的对比度各 **≥ 3:1**
  （量 computed color 算 WCAG 对比）；真键盘 Tab 走完 13 屏每屏至少一个控件环可见。
- **SC-005**: 中英两语下，Playwright 量所有药丸类元素 **零个** `scrollWidth > clientWidth`；
  弹窗底栏对面板 **±1px**。
- **SC-006**: 导航展开态量宽 **216px**、折叠态 **60px**；折叠状态刷新后保持。
- **SC-007**: 初始 JS chunk gzip **≤ 512KB**（字体不计入）；产物 woff2 总量相对 v0.16.0
  的增量 **≤ 2MB**（Inter Variable + Noto Sans SC 500）。
- **SC-008**: 现有 507 条前端测试 + 本轮新增全部通过；七条合并门禁全绿；
  `go test` 零改动仍绿。
- **SC-009**: 全站 **零处** `<select>` 原生元素（除 shadcn 内部）；026 的十二处
  `SearchSelect` 仍在 `searchableSelects.test.ts` 白名单里且测试绿。

---

## 本轮裁定（决策 215–232）

| # | 裁定 | 推翻 / 依据 |
|---|---|---|
| 215 | **像素级还原**为验收尺子；列宽、内边距、字号以原型为准 | 推翻决策 135；开发者在被提示冲突后确认 |
| 216 | **只有一套深色**；017 规则原形保留，「浅」改「深」；`users.theme` 不读 | 改写 017 |
| 217 | 筛选栏下拉**规则赢**：`Select`/`SearchSelect` 保留，触发器按 `.input` 34px 画，弹出面板不比像素 | CLAUDE.md 硬规则；026 |
| 218 | **右栏只读不动**；字段页原型的「解绑」列与「＋ 绑定到类别」不画，`bindElsewhere` 保留 | 024 决策 12 / v6 决策 72 |
| 219 | **常显说明不画回来**；审计、角色两处留在 ⓘ 里 | 上一轮的删除维持 |
| 220 | **动画全删**；只留行操作 `opacity .12s` 与导航 `transition-colors`；源码不变量 | 交接文档 |
| 221 | **导航折叠做**；品牌块为切换按钮；60px 仅图标；`title`；`localStorage`；窄屏沿用 | 交接文档的 Tweak 升为需求 |
| 222 | 录入设备表单**仍按 schema 动态生成**；原型示例字段不构成需求 | 交接文档自述 |
| 223 | **登录页按原型重做**；上周那版不留 | 决策 215 |
| 224 | 字体 **Inter Variable + Noto Sans SC 400/500/700**；Figtree、Caprasimo 卸除；自托管不变 | 中英混排字重 |
| 225 | 图标 **Phosphor 全量替换**；lucide 卸除；源码不变量 | 交接文档 |
| 226 | **Logo 立方体线框**；三个图标文件重出；`favicon.test` 改钉新 token | 交接文档 |
| 227 | 验收证据：**中文逐屏截图存档**；英文只查不破版 | 原型是中文的 |
| 228 | 八个状态色三值与交接文档**一字不差**；017 颜色分工原样成立 | 017 |
| 229 | 焦点环 2px accent 外框，bg 与 surface 两种底各 ≥ 3:1，**真键盘验** | 017 焦点环规则改写 |
| 230 | **服务端零改动** | 三处数据已有 |
| 231 | 四份设计输入入库 `specs/030-*/design/`；交接文档的 px 值有约束力 | — |
| 232 | 版本号**先不定**；tag 照旧等确认 | — |

---

## Assumptions

- 原型 `design/prototype.dc.html` 里的示例数据（产品词汇、字段名、人名）不构成需求；
  只有版面与样式构成需求。
- 交接文档说的 `.btn/.tag/.seg/.dialog/.radio/.input/.card/.table` 是 Nocturne 类名，落地时
  对应 `Button/Badge/ToggleGroup/Dialog/RadioGroup/Input/Card/Table` 的变体；不新建自定义组件。
  若某个形制 shadcn 没有对应物（例如「确认弹窗左缘红色内阴影」可用 `AlertDialog` 的
  `className` 做到），在实施中若发现确实需要新组件，先与开发者确认。
- 原型没有画右键菜单，`ContextMenu` 保留现有实现，只换皮。
- 原型的批量导入三步、打印标签队列、导出范围等**流程**与现状一致，只换皮。
- `Tooltip`（029 加的 `Ellipsis`/`TruncatedTip`）保留，按 Nocturne 换皮；折叠导航的
  `title` 与它并存（`title` 是交接文档的写法，也是本仓库 `deniedReason` 的一贯做法）。
- 英文界面的字号与中文相同；交接文档没有给英文单独的值。
- 走查在 1440×900 视口做，与原型画布一致；窄屏只查塌陷逻辑仍工作，不做像素对照。
- 浏览器缓存里的旧 favicon 不做失效处理。
