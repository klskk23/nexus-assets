---

description: "Task list for 030 — Nocturne 深色系统，像素级换皮"
---

# Tasks: Nocturne 深色系统，像素级换皮

**Input**: Design documents from `/specs/030-nocturne-dark-theme/`

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ui-tokens.md ✅ · quickstart.md ✅ · design/ ✅

**Tests**: 强制（章程原则 II）。本轮**至少两处红→绿双向验**：状态色 24 值（T012）、
`animate-` 零命中（T013）。触及 UI 的每个阶段必须有 DOM 测试新增或更新。
**jsdom 量不了版面**：任何 px 的断言都是源码不变量或实机走查，不写渲染断言。

**服务端零改动。不推送、不打 tag（决策 232）。**

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可并行（不同文件、无未完成依赖）
- **[Story]**：US1–US6，对应 spec 的六个故事

---

## Phase 1: Setup（依赖与字体）

- [ ] T001 `web/package.json`：`npm i @phosphor-icons/react@2.1.10 @fontsource-variable/inter@5.3.0`；
      `npm rm lucide-react @fontsource/caprasimo @fontsource-variable/figtree tw-animate-css`。
      **先卸后装会让 tsc 立刻红一片**，这是预期 —— 直到 T020 之前不要求 tsc 绿。
- [ ] T002 `web/src/assets/fonts/fonts.css` 重写：`@import "@fontsource-variable/inter/wght.css"`、
      `@fontsource/noto-sans-sc/400.css`、`/500.css`、`/700.css`；注释写明为什么要 500
      （Inter 500 标题里的汉字，`font-synthesis-weight: none`）。
- [ ] T003 [P] `web/public/fonts/`：Caprasimo、Figtree 的 OFL 文件删掉，放 Inter 的 OFL；
      `README` 或注释指向来源。

---

## Phase 2: Foundational（token、不变量、组件层）— **不可并行，按序**

**每一屏都站在这上面。九条不变量先红，组件层改完转绿。**

- [ ] T004 `web/src/index.css` `:root`：按 `contracts/ui-tokens.md` §1 整表换值。删除
      `--primary-hover`、`--radius-2xl`、`--radius-xl`；新增 `--selected`、
      `--selected-foreground`、`--destructive-line`。顶部注释改写：说明 Nocturne 的
      「accent」= 本表的 `--primary`，shadcn 的 `--accent` = 悬停底，**`accent-N` 是色阶、
      `accent` 是悬停底**。加 `color-scheme: dark`。
- [ ] T005 同文件 `@theme inline`：`--radius-sm/md/lg = 4/8/14px`；`--font-sans`/`--font-heading`
      指向 Inter；`--font-mono`；新增 `--color-neutral-100…900` 与 `--color-accent-100…900`
      （§2）、`--color-selected*`、`--color-destructive-line`。注释写明 neutral 覆盖
      Tailwind 内建。
- [ ] T006 同文件 `.status-*` 八组三值按 §3 逐字替换；`.status-chip` 保留消费方式。
- [ ] T007 同文件：删 `@import "tw-animate-css"`；`font-heading` 工具类改为
      `font-family: var(--font-heading); font-weight: 500`。
- [ ] T008 `web/tests/nocturne.test.ts`（新）九条源码不变量，按 `contracts/ui-tokens.md` §3 §5：
      ① 24 个 oklch 逐字；② `animate-in|animate-out|fade-in-|fade-out-|zoom-in-|zoom-out-|slide-in-|slide-out-`
      零命中（**不是裸 `animate-`**，`animate-spin` 要留）；③ `lucide-react` 零；④ `dark:`
      与 `\.dark\b` 零；⑤ `tw-animate-css` 零；⑥ routes/features 六位十六进制零；
      ⑦ `googleapis|gstatic|Caprasimo|Figtree` 零；⑧ `rounded-full` 白名单（头像 / 单选点 /
      spinner）；⑨ `--primary-hover|--radius-2xl|--radius-xl` 不存在。**此刻应有 ②③⑧ 红**
      （组件层还没改），记下红的条数。
- [ ] T009 `web/src/components/ui/button.tsx`：按 research §二重写五个变体与尺寸
      （default = accent 描边、secondary = divider 描边、ghost、destructive = 红 ghost、link）；
      圆角 8；14px `font-heading`；`disabled:opacity-45`；icon 36 / sm-icon 30 / xs-icon 28；
      **去 `rounded-full`**。
- [ ] T010 `web/src/components/ui/dialog.tsx` 与 `alert-dialog.tsx`：容器 surface + `shadow-lg`
      + 14px + `p-[22px_24px] gap-4`；遮罩 `bg-[color-mix(in_srgb,var(--color-neutral-900)_50%,transparent)]`；
      **删角落装饰圆**；`DialogFooter` 去 `-mx-8 bg-well` 带子改 `flex justify-end gap-2`；
      ✕ 28px ghost；AlertDialog 加 `shadow-[inset_2px_0_0_var(--destructive-line)]`；
      **删全部 `animate-*` 类**。`InsideDialogContext`（029）保留。
- [ ] T011 [P] `web/src/components/ui/{input,textarea,input-group}.tsx`：`.input` 形制（surface、
      divider、8px、36px；`size` 变体 40 / 34 / 32）；hover / focus-visible 边色。
- [ ] T012 [P] `web/src/components/ui/badge.tsx`：`.tag` 形制 + accent / neutral / outline 变体。
      **红→绿双向验（状态色）**：把 T006 里 amber 的 `bar` 改一位，`nocturne.test.ts` ①
      必须红；改回转绿。记录在 commit message。
- [ ] T013 [P] `web/src/components/ui/{select,popover,dropdown-menu,context-menu,hover-card,tooltip}.tsx`：
      面板 surface + `shadow-md`（tooltip）/ `shadow-lg`、8px；项悬停 `bg-accent`；
      **删全部 `animate-*`**。**红→绿双向验（动画）**：给任一面板加回一条 `animate-in`，
      `nocturne.test.ts` ② 必须红；删掉转绿。
- [ ] T014 [P] `web/src/components/ui/{tabs,toggle-group,toggle}.tsx`：`.seg` 形制。
      `dialogTrack.test.ts` 守的 `flex-wrap` 与 `spacing` 不动。
- [ ] T015 [P] `web/src/components/ui/{table,card,checkbox,radio-group,alert,progress,skeleton,spinner,sonner,drawer}.tsx`：
      按 research §二各自换色阶与形制；表头去底色；checkbox 15px；radio 16px；
      alert destructive 不填充；spinner 保留 `animate-spin`。
- [ ] T016 `npx vitest run tests/nocturne.test.ts`：**九条全绿**。`grep -rn "animate-\|rounded-full" web/src/components/ui` 复核。

**Checkpoint**：任意一页打开是深色、按钮描边、弹窗即开即关。tsc 仍会因 lucide 而红，
到 T020 解决。

---

## Phase 3: US4 — 深色地面上分得清状态、动作与焦点 (P1)

> 颜色分工的**实现**在 Phase 2 已落地；这一阶段是把它**钉住**与**量出来**。

- [ ] T017 [US4] `web/src/features/statuses/StatusBadge.tsx` 与 `web/src/features/overview/DistributionBar.tsx`：
      `.status-chip` 消费新三值；分布条轨道 `bg-neutral-900` 6px、填充按 状态 `--status-line` /
      类别 `bg-accent-600` / 负责人 `bg-neutral-500`；`96px 1fr 40px`。
- [ ] T018 [US4] 审计「变更内容」的前后值：`web/src/features/audit/*`（按 screen-map）
      左缘 2px `neutral-700` / `primary`，确认**没有**红绿。
- [ ] T019 [US4] 走查量化（quickstart「量化检查」）：真键盘 Tab 在 02、03、05 三屏各取一个控件，
      记 `outlineColor/outlineWidth`；算 `--ring` 对 bg 与 surface 的对比度，期望 5.46 / 4.71，
      写进 `quickstart.md` 差异表。

**Checkpoint**：SC-003、SC-004 成立。

---

## Phase 4: 图标与标志（阻塞 US1/US2）

- [ ] T020 `web/src/features/common/navIcons.ts`：改 import 为 `@phosphor-icons/react`，
      类型 `LucideIcon → Icon`，**11 条映射逐条替换并在 16px `weight="regular"` 下看过**：
      `/` LayoutDashboard→`SquaresFour`；`/assets` Boxes→`Package`；`/categories` FolderTree→`TreeStructure`；
      `/fields` Columns3→`Columns`；`/models` Cpu→`Cpu`；`/statuses` CircleDot→`RadioButton`；
      `/holders` Warehouse→`Warehouse`；`/users` Users→`Users`；`/roles` ShieldCheck→`ShieldCheck`；
      `/audit` ScrollText→`Scroll`；兜底 Inbox→`Tray`。注释里「2.75 stroke」那句改成
      Phosphor regular。
- [ ] T021 其余 52 个文件按 research §四对照表替换（`AlertCircleIcon→WarningCircle` ×25 是大头）；
      `Loader2Icon→CircleNotch` 保留 `animate-spin`；`type LucideIcon→type Icon`。
      `npx tsc --noEmit` **转绿**；`nocturne.test.ts` ③ 绿。
- [ ] T022 [P] `web/src/features/common/Logo.tsx`：立方体线框（Phosphor `Cube`）置于 1px
      `border-primary` 8px 方块内；尺寸由 `className` 给（导航 28、登录 36）。
- [ ] T023 [P] `web/public/logo.svg`、`favicon.ico`（16+32）、`apple-touch-icon.png` 重出：
      立方体线框，只用 `#9184d9` 与 `#161826`；`rsvg-convert` + ImageMagick 生成。
- [ ] T024 [P] `web/tests/favicon.test.ts`：`TOKENS = ["--primary", "--background"]`；注释改写。

**Checkpoint**：`lucide-react` 零命中；标签页图标是立方体。

---

## Phase 5: US1 — 一套完整的深色界面：壳与登录 (P1) 🎯 MVP

**Goal**: 壳、导航、登录页按第 1 屏与「全局壳」落地。

**Independent Test**: 截图 01（登录）与 02 的壳部分；设置弹窗无主题项；系统浅色下仍深色。

- [ ] T025 [US1] `web/src/routes/AppShell.tsx`：`grid-cols-[216px_minmax(0,1fr)] h-screen`；导航
      `p-[18px_12px_14px]`、右 1px border、渐变底；品牌块 28px + 「Nexus Assets」15px；
      三组、组标题 11px `.06em` `neutral-500` `p-[14px_10px_4px]`；导航项 `p-[7px_10px]` 8px 13.5px
      `gap-2.5`、默认 `neutral-400`、悬停 `bg-accent text-foreground`、激活 `bg-selected
      text-selected-foreground` + 左缘 `-left-3` 2px `bg-primary shadow-[0_0_10px_var(--primary)]`
      竖线；内容区 `p-[26px_36px_64px_32px]` 内 `grid gap-[22px]`。
- [ ] T026 [US1] 同文件底部：顶边渐隐分隔；账号按钮（28px 圆头像 `bg-accent-900 text-accent-200`、
      姓名 13px、角色 11px `neutral-500`）→ 设置弹窗；30px 退出图标按钮。
      **`rounded-full` 白名单里的「头像」就是这一处。**
- [ ] T027 [US1] `web/src/routes/Login.tsx` 按第 1 屏重写：径向渐变底、右侧两圆一线
      （`max-md:hidden`）、420px 卡片区 `gap-7`、36px 发光品牌块、28px 标题、40px 输入框与按钮、
      「或」渐隐分隔、Google 按钮 secondary block。`contentColumn.test.ts` 白名单条目更新。
- [ ] T028 [US1] `web/tests/login.test.tsx`：可达性断言不变，删旧装饰断言；
      `web/tests/a11y.test.tsx` 若断言了壳的类名则随之改。
- [ ] T029 [US1] 走查：截图 `01-login.png`、`02-overview.png`（壳）+ 原型并排；设置弹窗
      确认无主题项；差异记录。

**Checkpoint**：US1 独立可验收。

---

## Phase 6: US5 — 导航折叠 (P2)

- [ ] T030 [P] [US5] `web/src/i18n/zh.ts` / `en.ts`：`nav.collapse`「折叠导航」/ "Collapse navigation"、
      `nav.expand`「展开导航」/ "Expand navigation"。
- [ ] T031 [P] [US5] `web/src/features/common/useNavCollapsed.ts`（新）：`localStorage["nexus.nav.collapsed"]`，
      读写包 try/catch，读不到 = 展开。
- [ ] T032 [US5] `web/tests/navCollapse.test.tsx`（新，**先写**）：点品牌块 → 导航项文字不可见、
      每项 `title`；再点展开；`localStorage` 写入并重新挂载后读回；品牌块 `aria-label` 随状态切换。
- [ ] T033 [US5] `web/src/routes/AppShell.tsx`：品牌块变 `<button>`（`aria-label` = collapse/expand）；
      折叠态 `grid-cols-[60px_…]`、只画图标、`title`、激活竖线仍在左缘；`max-md` 下不参与
      （源码断言在 T032）。T032 转绿。
- [ ] T034 [US5] 走查：量导航 216 / 60；折叠态截一张 `02b-overview-collapsed.png`（附加，不计入 26）。

---

## Phase 7: 共用件（阻塞 US2 的十二屏）

- [ ] T035 `web/src/features/common/MasterDetail.tsx`：左栏 `300 → 280px`。三个调用方零改动
      （024 骨架标准再验一次）；`masterDetail.test.tsx` 不动。
- [ ] T036 [P] `web/src/features/common/{Rail,RailRow,TreePager}.tsx`：搜索框 32px；行 `p-[6px_10px]`
      + `10 + depth×16` 缩进 13.5px；子级 `neutral-400`；激活 `bg-selected text-selected-foreground`；
      右端数量 12px `neutral-500`；翻页按钮 30px secondary。
- [ ] T037 [P] `web/src/features/common/PageHeader.tsx`：`h1` 26px `font-heading`；右端 `gap-2.5`；
      ⓘ 16px 圆（`Hint.tsx`）。
- [ ] T038 [P] `web/src/features/common/Pane.tsx`（含 `Fact`）：`.card shadow-sm p-[20px_24px] gap-5`；
      名称 20px；事实 `dl` `bg-well rounded-md p-[14px_16px]`，`dt` 12px `neutral-500`、`dd` 14px。
- [ ] T039 [P] `web/src/features/common/TableFrame.tsx`：渐隐行线在此画一次（`linear-gradient` 8% 文本色，
      两端 48px 透明）；翻页条 30px 按钮、范围文字 12px。
- [ ] T040 [P] `web/src/features/common/ListToolbar.tsx`：搜索框 260px `pl-[30px]` 放大镜 14px；
      筛选控件 `size=34`；「清除筛选」ghost。
- [ ] T041 [P] `web/src/features/assets/ActionBar.tsx`：`.dialog` 风格浮层（surface、`shadow-lg`、14px、
      `p-[8px_8px_8px_16px]`）；「已选 N 台」`text-accent-300`；按钮 30px secondary；删除红 ghost。
- [ ] T042 `web/tests/contentColumn.test.ts` 改写：白名单 = `contracts/ui-tokens.md` §6，每条
      理由引用 handoff 段落；注释改写为「以原型为准，决策 215」。
- [ ] T043 `web/tests/transferAudit.test.tsx`（唯一断言了 Organic 类名的测试）随 T036–T041 改。

---

## Phase 8: US2 — 十三个页面逐屏 (P1)

**每个任务末尾 = 截图存档 + 差异记录。** 屏 01、02 的壳已在 US1 截过，这里补 02 的内容区。

- [ ] T044 [US2] 概览 `web/src/routes/Overview.tsx`：三张卡 `minmax(300px,1fr) gap-4`、`p-[18px_20px] gap-3.5`；
      最近流转四列表 + 30px `Select`（5/10/20）；`grid gap-[34px]`。截图 `02-overview.png` 覆盖 T029 的那张。
- [ ] T045 [US2] 资产列表 `web/src/routes/Assets.tsx`：筛选行；表格列（复选 15px、编号等宽 13px、
      状态 `.tag`、厂商 `neutral-400`、备注 `max-w-[220px]` 省略 + `title`、行操作
      `opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]`）；选中行
      `bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]`；每页 20/50/100；空态句。
      **筛选下拉保持 `SearchSelect`**（决策 217）。截图 `03-assets.png`（勾一行）。
- [ ] T046 [US2] 设备详情 `web/src/routes/AssetDetail.tsx`：`max-w-[1100px] gap-[30px]`；「← 资产」ghost；
      `h1` 30px tabular + 状态 `.tag`；右端四按钮；四项事实卡 `minmax(180px,1fr)`；属性两列
      `minmax(340px,1fr) gap-x-10`、行 `py-2.5` 渐隐线、`dt` 110px；`.tag-outline` 10px 来源标；
      成功横幅 `bg-accent-900 text-accent-200`。截图 `04-asset-detail.png`。
- [ ] T047 [US2] 类别 `web/src/routes/Categories.tsx` + `features/categories/CategoryDetail.tsx`：
      标题 + ⓘ；右上「新建类别」；右栏名称 20px + 代号等宽 12px + 「编辑类别」secondary；
      事实四项；链接「看这个类别的 N 台设备（含子类别）→」；字段表五列（必填 `.tag-outline` 或 —、
      继承自 `.tag-neutral` 或 —）。截图 `05-categories.png`。
- [ ] T048 [US2] 字段 `web/src/routes/Fields.tsx` + `features/fields/FieldDetail.tsx`：左栏按组分节
      （节标题 11px、行右端键名等宽 11.5px）；右栏显示名 20px + 键名 + 类型 `.tag-neutral` +
      「唯一」`.tag-outline` + 编辑；事实四项；表达式 `code` 块（`bg-well` 左 2px `border-primary`
      `text-accent-300`）+ 「怎么写」链接；**「绑在哪些目标上」表三列，无解绑列、无「＋ 绑定到类别」，
      `bindElsewhere` 保留**（决策 218）。截图 `06-fields.png`。
- [ ] T049 [US2] 型号 `web/src/routes/Models.tsx` + `features/models/{ModelDetail,VendorDetail}.tsx`：
      左栏按厂商分节（标题右端型号数、行 `pl-[18px]`、右端在册数）；右栏型号名 20px + 厂商 13px +
      「在册 N 台」`.tag-neutral` + 编辑；备注段；两栏 `minmax(320px,1fr)` 默认值表 / 字段表
      （来源 `.tag-neutral`）。截图 `07-models.png`。
- [ ] T050 [US2] 状态 `web/src/routes/Statuses.tsx`：搜索框 `max-w-[360px]`；五列表（显示名 `.tag`、
      键名等宽、类型、行为 `.tag-neutral`、使用情况「N 台设备・历史 M 条」）；行点开编辑。
      截图 `08-statuses.png`。
- [ ] T051 [US2] 持有方 `web/src/routes/Holders.tsx` + `features/holders/HolderDetail.tsx`：左栏名称 +
      类型 11px + 数量；树下 12px「默认库存点：X」；右栏名称 + 类型 `.tag-neutral` + 「默认库存点」
      `.tag-outline`；右端「设为默认库存点」secondary + 「编辑」primary；事实四项；备注段。
      截图 `09-holders.png`。
- [ ] T052 [US2] 账号 `web/src/routes/Users.tsx`：筛选（搜索 260、角色、状态）；五列表（邮箱等宽
      12.5px `neutral-300`、登录方式由 `auth_type` 译、状态 `.tag-neutral`/`.tag-outline`）。
      截图 `10-users.png`。
- [ ] T053 [US2] 角色 `web/src/routes/Roles.tsx`：三列表（管理员 → `.tag-accent`「全部权限」；否则
      「N 项」+ 前 4 项…；账号数）；**无表下说明**（决策 219）。截图 `11-roles.png`。
- [ ] T054 [US2] 操作审计 `web/src/routes/Audit.tsx` + `features/audit/AuditTabs.tsx`：`.seg` 切换；
      筛选（搜索、对象类型、操作、操作人、日期按钮、清除、右端「共 N 条」）；四列表；
      **无标题下说明**（决策 219）。截图 `12-audit.png`。
- [ ] T055 [US2] 流转审计 `web/src/routes/TransferAudit.tsx` + `features/transfers/MovementCell.tsx`：
      筛选（资产编号等宽 220px、操作人、动作、时间）；表同概览最近流转；动作 Badge neutral 变体。
      截图 `13-audit-transfers.png`。
- [ ] T056 [US2] 每屏随改的既有 DOM 测试（凡断言文案与角色的不动；断言类名的改），
      `npx vitest run --maxWorkers=4` 全绿。

**Checkpoint**：13 张屏截图齐、差异表填满、每条处置三选一。

---

## Phase 9: US3 — 十三个弹窗 (P2)

> 容器形制在 T010 已换。这里只剩各弹窗**自己**的宽度、内部布局与特殊件。每个任务末尾截图 + 差异记录。

- [ ] T057 [US3] 设置 `web/src/features/settings/SettingsDialog.tsx`：560；语言 `.seg`；API 密钥表 +
      「新建密钥」28px；文档链接；**无主题项**。`d01`。
- [ ] T058 [US3] 流转 `web/src/features/transfers/TransferDialog.tsx`：520；标题后缀；动作 `.seg`
      （`dialogTrack` 的 `flex-wrap` 不动）；目标 / 负责人 `SearchSelect`；备注；提交后横幅。`d02`。
- [ ] T059 [US3] 状态编辑 `web/src/features/statuses/*`：460；键名（编辑禁用）、显示名、颜色
      `Select` + 实时 `.tag` 预览、行为两复选、内置提示。`d03`。
- [ ] T060 [US3] 编辑类别 `web/src/features/categories/CategoryEditor.tsx`：480；四字段 + 复选；
      左下「删除类别」红 ghost。`d04`。
- [ ] T061 [US3] 录入设备 `web/src/features/assets/NewAssetDialog.tsx`：560；类别 / 型号 / 持有方 +
      `DynamicForm`（决策 222）；说明句。`d05`。
- [ ] T062 [US3] 账号 `web/src/features/users/UserEditor.tsx`：480；邮箱禁用 + 说明；重置密码
      （SSO 禁用）；停用 / 启用 → 确认。`d06`。
- [ ] T063 [US3] 角色 `web/src/features/roles/RoleEditor.tsx`：560；管理员只读说明；19 项复选
      `repeat(auto-fill,minmax(160px,1fr))`；左下「删除角色」。`d07`。
- [ ] T064 [US3] 变更内容 `web/src/features/audit/*`：640；前后 `pre` 左缘 2px。`d08`。
- [ ] T065 [US3] 确认 `web/src/features/common/ConfirmDialog.tsx`：440；红缘（T010）；type-to-confirm +
      复制按钮；主按钮红描边。`d09`。
- [ ] T066 [US3] 批量导入 `web/src/features/import/ImportDialog.tsx`：680；三步圆圈（完成 / 当前 accent
      描边、未到 `neutral-700`）；虚线文件区；琥珀色提示条（amber 状态槽位？**不**——用
      `--status-*` 画非状态违反 FR-004，用 `accent-900`/`accent-200` 横幅）；预览表错误列红字。`d10`。
- [ ] T067 [US3] 打印标签 `web/src/features/print/*`：560；计划态表 + 「确认打印 N 张」；队列表 +
      4px `Progress`。`d11`。
- [ ] T068 [US3] 导出 `web/src/features/assets/ExportDialog.tsx`：520；`RadioGroup` 范围；字段复选 +
      全选 / 全不选；固定列说明。`d12`。
- [ ] T069 [US3] 表达式帮助 `web/src/features/fields/ExpressionHelp.tsx`：640；两列 `.table`
      （等宽 `accent-300` 键）；「知道了」。`d13`。
- [ ] T070 [US3] 弹窗相关既有 DOM 测试随改（`dialogFocus`、`confirmDialog`、`confirmTone`、`editEvent`、
      `import`、`export`、`fieldEditor`、`expressionHelp`）全绿。**流转弹窗持有方下拉滚轮**
      （029）实机再验一次。

**Checkpoint**：13 张弹窗截图齐，26 张总数到位（SC-001）。

---

## Phase 10: US6 — 英文不破版 (P3)

- [ ] T071 [US6] 切 English，按 quickstart「药丸不换行」片段量 13 屏 + 13 弹窗：
      `scrollWidth > clientWidth` 期望零；弹窗底栏对面板 ±1px。结果写 `quickstart.md`。
- [ ] T072 [US6] 凡量出换行的，在对应组件补 `whitespace-nowrap`（FR-027），复量到零。

---

## Phase 11: Polish（文档、门禁）

- [ ] T073 [P] `docs/rules/web-forms.md`「视觉（017 Organic）」整节改写为「视觉（030 Nocturne）」：
      深色唯一（形状同 017）、圆角 4/8/14 无药丸、`rounded-full` 白名单、**焦点环可以直接用主色
      （5.46 / 4.71）**、颜色分工四句（`--primary` 动作 / `accent-600–900` 填充 / `.status-*` 状态 /
      `neutral-*` 数量）、字体 Inter + Noto 400/500/700、图标 Phosphor、无动画。写明推翻了哪几条。
- [ ] T074 [P] `docs/rules/web-tables.md`「版面数字（018）」改写为「版面数字（030）」：壳 216 / 60、
      内容区内边距、左栏 280、表头 11px、行线 8%、弹窗容器与宽度表；**决策 135 推翻**一句。
- [ ] T075 [P] `docs/rules/web-tables.md` 主从节：左栏 300 → 280 的一处数字。
- [ ] T076 Bundle 与字体：`npm run build`；量 `index-*.js` gzip（≤ 512KB）与 `dist/static/*.woff2`
      总量相对 v0.16.0 的增量（≤ 2MB）；写进 `quickstart.md`。
- [ ] T077 七条门禁本地全跑：`tsc`、`eslint`、`vitest --maxWorkers=4`、`build`、自定义组件守卫、
      bundle 预算、`go test`（零改动回归）。
- [ ] T078 `quickstart.md` 差异表收口：每条处置三选一；「报告」类汇总成一段给开发者。
- [ ] T079 按阶段提交（地基 / 图标 / 壳 / 共用件 / 各屏 / 弹窗 / 文档），**不推送、不打 tag**。

---

## Dependencies

```
Phase 1 → Phase 2（不可并行，T004–T016 按序）
Phase 2 → Phase 3（US4）、Phase 4（图标）
Phase 4 → Phase 5（US1）→ Phase 6（US5）
Phase 4 + Phase 7（共用件）→ Phase 8（US2）
Phase 2 → Phase 9（US3）（弹窗容器在 T010；各弹窗内部与屏无关，可与 Phase 8 交错）
Phase 8 + 9 → Phase 10（US6）→ Phase 11
```

## Parallel Execution

- Phase 2 内：T011–T015 五个组件族**可并行**（不同文件），但都在 T004–T010 之后、T016 之前。
- Phase 4 内：T022–T024 并行。
- Phase 6 内：T030–T031 并行。
- Phase 7 内：T036–T041 六个共用件并行。
- Phase 8 的十二屏彼此独立，可任意顺序；Phase 9 的十三弹窗同理。
- Phase 11 的三份文档并行。

## Implementation Strategy

**MVP = Phase 1–5**：地基 + 图标 + 壳与登录。到这里系统已经整体是深色、按钮描边、弹窗
即开即关、标签页是立方体 —— 一个「半深半浅」的中间态**不存在**，因为地基一次换掉所有 token。
之后每一屏、每一弹窗是把版面数字对到原型，独立可验收、独立可提交。

**版本号**：全部 79 条完成、26 张截图齐、差异表收口后，再由开发者定（决策 232）。
