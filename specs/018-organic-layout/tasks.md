# 任务：Organic 版面重做

**规格**：[spec.md](./spec.md) ｜ **计划**：[plan.md](./plan.md) ｜ **调研**：[research.md](./research.md) ｜ **决策**：122–129

`[P]` = 可并行（不同文件、无未完成依赖）。`[US1]`–`[US9]` = 服务于哪个用户故事。

**跑测试一律加 `--maxWorkers=4`**（根 CLAUDE.md 有记，默认并发会把这台机器打满）。

**这一轮测试守不住版面**（712 条角色断言里断言尺寸类的有 0 条）。
所以每个阶段末尾都有一条截图任务 —— 那不是补充，那是主要验收手段。

---

## 第 1 阶段：基线（做任何改动之前）

- [X] T001 起本地实例并灌种子数据（`quickstart.md` 顶部的命令），确认 16 个路由都打得开
- [X] T002 **拍改造前的基线截图**，16 个路由各一张，存 `.playwright-mcp/before/`。
      版面轮改完之后「变好了没有」只能靠对比回答，事后补拍不回来
- [X] T003 写一段量尺子的控制台片段并存进 `quickstart.md`：给定选择器吐出
      行高、内边距、相邻分区间距、背景色。**逐页目测「看起来对」不算验收**

## 第 2 阶段：共用件（阻塞所有故事）

改完这一阶段，**十个表格页与八个元数据页一起动**。先改页面再改共用件等于每页看两遍。

- [X] T004 `web/src/components/ui/table.tsx`：`TableHead` 的 `h-9 px-2` 改成
      `px-5 py-[15px]`，字重 `font-medium` → `font-semibold`，
      色 `text-muted-foreground` → `text-secondary-foreground`
- [X] T005 `web/src/components/ui/table.tsx`：`TableCell` 的 `px-2 py-1.5` 改成
      `px-5 py-[15px]`，字号 14px，并加 `tabular-nums`（FR-013：列里的数字必须等宽 ——
      台账是竖着读的，比例数字会让一列编号看起来参差）。
      **行高 48px 由内边距得出，不要给 `TableRow` 设 `h-12`** ——
      显式高度会和含芯片、含按钮的行打架（research 第三节）
- [X] T006 `web/src/features/common/TableFrame.tsx`：`bg-card` → `bg-background`。
      **边框与 28px 圆角保留** —— 稿子的容器是
      `border 1px + radius 28px + background: var(--background)`，不是去掉容器
- [X] T007 `web/src/features/common/PageHeader.tsx`：**摘掉中文 h1 上的 `font-heading`**，
      改成 `text-[40px] leading-[1.2] font-bold`。017 在这里写了条注释解释为什么不加字重 ——
      那条推理建立在「Caprasimo 渲染了这些字」的错误前提上，注释一并改掉
- [X] T008 `web/src/features/common/ListToolbar.tsx`：搜索框 640px 上限；
      控件按**纵向内边距**规定而非高度（研究第七节：按钮 11–13px 内边距 ≈ 44px，
      与「输入/选择 48px」不冲突）
- [X] T009 `web/src/index.css`：焦点环从 `ring-[3px] ring-ring` 换成
      `outline: 2px solid var(--ring); outline-offset: 2px`。
      **调研已实测四种底色 5.09–6.22，全过**（research 第五节），本任务只做机制替换
- [X] T010 全站悬停态统一：每个可交互元素给 `--accent` 浅底 + `--accent-foreground` 文字，
      主按钮压深到 `#b3632f`，链接默认 `--accent-foreground`、hover 转 `--primary`（FR-016）。
      **稿子的全局规则第 8 条，此前一个任务都没对上**
- [X] T011 `web/src/features/common/Pager.tsx`：节奏调到区内成组 22–24px。
      **结构一字不动** —— 它必须仍是表格下方的一整行，含区间、页码、每页条数（FR-021）
- [X] T012 跑 `npx vitest run --maxWorkers=4`。**预期 367 全绿** ——
      共用件只改类名不动角色。**有测试红说明动到了 DOM 结构，停下来查**
- [X] T013 截图：任选两个元数据页 + 资产列表，确认行高 48、表头字重与色已变。
      对照 T002 的基线

## 第 3 阶段：US2 三档地面各归各位（P1）

**独立验收**：控制台列出所有 `#ebddc5` 背景的元素，每一处都必须是真正浮起的东西。

判据只有一句：**它浮在页面之上吗。** 十九处逐个回答，不做全局替换。

- [X] T014 [US2] **保持不变**：`web/src/features/assets/ActionBar.tsx`（`sticky bottom-4`，
      真的浮在表格之上）与 `web/src/components/ui/card.tsx`（浮起原语本身）。
      本任务只是把这个判断写进两处的注释，防止后来者顺手「统一」掉
- [X] T015 [P] [US2] `web/src/features/overview/StatCard.tsx`：`<Card>` → 地面色 +
      `border border-border-muted`，圆角 28px，内边距 22/24/20，最小宽 152px
- [X] T016 [P] [US2] `web/src/routes/Overview.tsx` 三处 `<Card>`（约 117/141/194 行）：
      分区改用留白（56px）承担分隔，不再套卡片
- [X] T017 [P] [US2] `web/src/routes/AssetDetail.tsx` 六处 `<Card>`（约 230/280/315/342/489/514 行）：
      只读值组改坐 `--well`，其余分区改用留白
- [X] T018 [P] [US2] `web/src/routes/Import.tsx` 三处 `<Card>`（约 130/190/239 行）：改用留白分区
- [X] T019 [P] [US2] `web/src/routes/AssetHistory.tsx`（约 64 行）与
      `web/src/features/transfers/EditEvent.tsx`（约 67 行）的 `<Card>`：同上
- [X] T020 [P] [US2] `web/src/routes/Login.tsx`：去掉左列的 `bg-card` 面板 ——
      稿子的 `SignIn` 没有这块面板，两列直接坐在地面上
- [X] T021 [US2] **找开发者确认 `web/src/components/ui/alert.tsx` 的 `bg-card`**。
      Alert 不浮起，按规则该换；但它波及全站每一条提示，且参照稿没有画 Alert。
      **这是逐条确认项之一，不要顺手改**
- [X] T022 [US2] 静态检查：`grep -rn "bg-card\|<Card" web/src --include='*.tsx'` 的命中集合
      必须等于白名单（`ActionBar`、`ui/card.tsx`，以及 T021 裁定后的 `ui/alert.tsx`）。
      把这条检查写进 `quickstart.md` 第 5 步
- [X] T023 [US2] 截图：概览、资产详情、导入三页，确认没有卡片墙

## 第 4 阶段：US4 列表页可读（P1）

**独立验收**：十个表格页行高 48、表头形态一致；资产页选择模型七项一件不少。

- [X] T024 [US4] `web/src/features/metadata/CrudPage.tsx`：外层 `grid gap-6` → 分区 56px、
      区内成组 22–24px。**改这一个，八个元数据页一起变**（FR-024）
- [X] T025 [US4] `web/tests/` 新建一条 `CrudPage` 的骨架测试：渲染后同时存在
      页标题、搜索框、表格行、翻页条四者。**八个元数据页共享这一个结构契约** ——
      现在它由八份逐页测试间接守着，重排时若掉了翻页条，八处会一起红，
      而没人看得出那是同一件事。章程原则二要求触及 UI 必须新增或更新 DOM 测试，
      而这是本轮爆炸半径最大的一处改动
- [X] T026 [US4] `web/src/routes/Assets.tsx`：内容列 960px 上限并贴左；
      **选择模型一件不动** —— 勾选列、全选框、横幅、Shift 连选、行尾三按钮、批量条
- [X] T027 [US4] `web/src/routes/Categories.tsx`：节奏调到 56/24。
      **缩进树、搜索切平铺、名称格里没有行内箭头 —— 三条一字不改**（FR-023）
- [X] T028 [US4] 跑地址栏的既有回归测试（筛选与翻页写进地址、用 replace 不用 push，
      FR-022）。**本轮要改 `Assets.tsx` 与 `Categories.tsx`，而这条坏了不报错** ——
      表现是「点进一台设备再返回，筛选没了」。确认 `useListQuery` 的 replace 语义未被触碰
- [X] T029 [US4] 跑八个元数据页的既有测试，确认**点击行编辑、右键出菜单、
      对话框内显示拒绝**三条行为一字未变
- [X] T030 [US4] 跑资产页的 7 条选择模型回归测试（017 留下的），确认全绿（SC-005）
- [X] T031 [US4] 截图：八个元数据页逐页拍，确认形态**完全一致** ——
      不一致说明有人绕过了共用件

## 第 5 阶段：US1 空间系统（P1）

**独立验收**：任意页量三件事 —— 内容列贴左且有上限、分区 56px、圆角容器内边距 ≥24px。

- [X] T032 [US1] `web/src/routes/AppShell.tsx`：主区加内容列上限（常规 960px），
      **贴左，右侧留白**。注意 research 第一节：现状不是「居中」而是「无界」，
      `max-w-7xl` 早就不在了 —— 要加的是上限本身
- [X] T033 [P] [US1] 正文类页面（`Categories.tsx` 的说明区、`Import.tsx` 的流程说明）
      内容列 760px 上限
- [X] T034 [P] [US1] 表单类（`features/transfers/TransferForm.tsx`）列宽 620–640px 贴左
- [X] T035 [US1] 圆角收敛到三档（FR-006）：容器 28px、**下沉块与提示块 20px**、
      小控件 999px。20px 这一档是新的 —— 017 的 `--radius-md` 是 16px，
      现有的井与提示块都还在用它
- [X] T036 [US1] 全站扫一遍 28px 圆角容器的内边距，**低于 24px 的补齐**（FR-003）——
      半径 28 的角会切到内容
- [X] T037 [US1] 截图：在 1920px 宽的窗口拍资产列表与概览，
      确认内容不顶到右边、右侧是留白

## 第 6 阶段：US3 中文标题层级（P1）

**独立验收**：中文页面上页标题、区标题、正文三级在不看颜色时可分。

- [X] T038 [US3] `web/src/routes/AssetDetail.tsx`：h1 是资产编号（拉丁数字），
      **应当加上 `font-heading`** + `tabular-nums`。T007 摘掉的是中文标题上的，
      这里是反过来 —— **漏了这条就白改**（plan 风险表）
- [X] T039 [P] [US3] 区标题统一 21px/700；计数、字段键名、页码加 `font-heading`
      （它们全是拉丁与数字）
- [X] T040 [US3] 截图：一个中文页 + 资产详情，确认中文靠字号分层、拉丁走 Caprasimo

## 第 7 阶段：AppShell 两版 —— 开发者裁定（闸）

**这一阶段堵住后面所有页面的最终收敛。** 侧栏的语汇会决定其余页面怎么理解「浮起」。

- [X] T041 A 版（稿子交付的）：`web/src/routes/AppShell.tsx` 侧栏 236px、
      `padding:36px 18px 48px 30px`、右边框 `1px solid var(--border-muted)`、
      裸数字编号带 `opacity:.6`、当前项整条满填陶土药丸、底部保留说明文字
- [X] T042 B 版（稿子自己列的四条改进）：去掉右边框，侧栏做成一块**圆角 `--well` 浮在地面上**；
      编号做成 24px 圆（闲置描边、当前实心）；当前态只让圆点吃色 + 文字加重 +
      `--accent` 浅底；删掉底部说明文字
- [X] T043 **两版各拍一张截图交开发者裁定。**
      提醒一句：改进①正是全局规则第 2 条本身 —— A 版会让外壳成为整轮里
      唯一一处用 hairline 分隔的地方
- [X] T044 按裁定结果保留一版，删掉另一版，把理由写进 `docs/rules/web-forms.md`

## 第 8 阶段：US5 概览（P2）

- [X] T045 [US5] `web/src/routes/Overview.tsx`：五个状态区块横向 flex-wrap，
      每个最小 152px，上芯片下 Caprasimo 34px 计数；**计数为 0 时数字退到次要色，
      但区块仍然可点**（筛出零条也是有效结果）
- [X] T046 [US5] `web/src/routes/Overview.tsx`：类别分布 + 快速录入改成
      `1.55fr / 1fr`、间距 40px
- [X] T047 [US5] `web/src/features/overview/DistributionBar.tsx`：轨道高 18px、
      类别名列 104px、计数列 46px 右对齐 Caprasimo。**整行可点**并跳到按类别筛选的列表
- [X] T048 [US5] ✅ **开发者裁定 2026-09-08：保留按最大类别。** 分布条按**最大类别**取比例（017 的决定），
      稿子没说比例基准。保留还是改成按总数？**逐条确认项之二**
- [X] T049 [US5] `web/src/features/transfers/Timeline.tsx`：行内边距 18px、
      鼠尾草圆点 10px、行间 `border-top: --border-muted`（末行补 bottom）
- [X] T050 [US5] ✅ **开发者裁定 2026-09-08：保留。** 时间线的「当前」标记（环形圆点 + 文字标，017 加的）
      稿子没画。保留还是按稿子拆掉？**逐条确认项之三**
- [X] T051 [US5] `web/tests/overview.test.tsx`：补一条断言 ——
      状态区块计数为 0 时仍可点击（版面改动不得把它变成死块）
- [X] T052 [US5] 截图概览页，对照 `Overview.dc.html`

## 第 9 阶段：US6 详情与流转（P2）

- [ ] T053 [US6] `web/src/routes/AssetDetail.tsx`：属性区改 `repeat(4, minmax(0,1fr))`
      网格，窄屏降 `repeat(2, ...)`，整块坐 `--well`、圆角 28、内边距 ≥24
- [ ] T054 [US6] `web/src/routes/AssetDetail.tsx`：页头 = 资产编号 h1 + 状态芯片
      （配合 T038 的 `font-heading`）
- [ ] T055 [US6] `web/src/features/transfers/TransferForm.tsx`：字段一律
      `Field`/`FieldGroup`，控件高 48px、圆角 999px
- [ ] T056 [US6] `web/tests/assetDetail.test.tsx`：补一条断言 ——
      属性网格渲染出全部字段（四列布局不得吞掉任何一个）
- [ ] T057 [US6] 截图详情与流转，对照 `AssetDetail.dc.html` 与 `Custody.dc.html`

## 第 10 阶段：US7 登录（P2）

- [ ] T058 [US7] `web/src/routes/Login.tsx`：`minmax(0,420px) / minmax(0,1fr)`、
      间距 64px、垂直居中、`min-height:560px`
- [ ] T059 [US7] `web/src/routes/Login.tsx`：产品名 Caprasimo 52px/1.05 两行；
      控件高 50px；「或」分隔线；整宽次级按钮
- [ ] T060 [US7] `web/src/routes/Login.tsx`：右侧四个绝对定位柔形
      （`--card` 300 / `--accent-2` 190 opacity .62 / `--primary` 132 opacity .9 /
      `--border` 描边空心 84），`aria-hidden`，**不含任何状态色槽**
- [ ] T061 [US7] **找开发者确认**：域名限制提示（017 加的，v1 唯一的准入边界）
      稿子的 `SignIn` 没有这一行。保留还是拆？**逐条确认项之一**
- [ ] T062 [US7] `web/tests/` 登录相关：确认域名提示在提交前可见的断言仍然成立
      （或按 T056 的裁定更新）
- [ ] T063 [US7] 截图登录页，对照 `SignIn.dc.html`

## 第 11 阶段：US8 打印对话框（P3）

- [ ] T064 [US8] `web/src/features/print/PrintDialog.tsx`：620px 上限、`--card` 底
      （**这一处用卡片是对的** —— 它真的浮起）、圆角 28、内边距 32、阴影
- [ ] T065 [US8] `web/src/features/print/PrintDialog.tsx`：提示块 `--well` 底、圆角 20、
      `padding:18px 22px`、左侧 Lucide info 图标 `stroke-width:2.75`
- [ ] T066 [US8] 作业列表：每行一张 `--well` 圆角 28 卡；药丸进度轨用**鼠尾草**
      （它数张数不数状态）；**只有「失败」那行用 `.status-red`**，因为那确实是一个状态
- [ ] T067 [US8] 截图打印对话框，对照 `PrintLabels.dc.html`

## 第 12 阶段：US9 三个没画的页面（P3）

**放在最后是有原因的**：它们要照抄的是前面十三页**收敛出来的**语汇，
不是我对规范的第一次解读。

- [ ] T068 [P] [US9] `web/src/routes/Import.tsx`：按收敛后的语汇重排流程页
- [ ] T069 [P] [US9] `web/src/routes/Audit.tsx`：重排。
      **前后值的新旧区分仍不得只依赖颜色**（017 的左侧竖线 + 标签，FR-025）
- [ ] T070 [P] [US9] `web/src/routes/AssetHistory.tsx`：重排，时间线沿用 T044 的形态
- [ ] T071 [US9] **三页截图交开发者确认**（FR-025）—— 它们没有稿子，
      是推导出来的，必须过一次人眼

## 第 13 阶段：收口

- [ ] T072 静态检查三条：① `bg-card` / `<Card` 的命中集合等于白名单；
      ② `font-heading` 的命中里没有中文标题；
      ③ 表格与统计里的数字列都带 `tabular-nums`（FR-013）
- [ ] T073 两份 i18n 复核。**本轮预期零新增文案**；若有（如侧栏底部文字的替代），
      两种语言齐全，`tests/i18n.test.ts` 的孤儿检查为零
- [ ] T074 **英文界面逐页走查**：16 个路由在英文下药丸不换行、48px 行高不被撑破、
      固定列宽没把内容挤没（SC-007）
- [ ] T075 **键盘走查**：从页头 Tab 到页尾，每个可交互元素都到得了，
      焦点环（outline 2px + offset 2）始终可见（SC-008）
- [ ] T076 `docs/rules/web-forms.md` 更新：三档地面的判据、圆角三档、
      内容列上限、48px 行高来自内边距、焦点环是 outline 不是 ring —— 
      让下一个人不必重新发现
- [ ] T077 空状态复核（FR-030）：48px 行高与新的地面分工不适用于空态。
      逐个确认空状态仍说清什么会填满它，被筛空时仍给出清除筛选
- [ ] T078 跑完整门禁（章程七条）：`gofmt -l` 空、`go vet`、`golangci-lint` 零告警；
      `go test ./...` 全过；`nexus verify`；`npx tsc --noEmit`、`eslint`、
      `vitest run --maxWorkers=4`、`npm run build`；真镜像 `deploy/smoke.sh`
- [ ] T079 **验证 SC-009**：`git diff main --stat -- internal/ cmd/ migrations/` 必须为**空**。
      非空说明这一轮越界了
- [ ] T080 按 [quickstart.md](./quickstart.md) 实机走完 19 步，带尺子量
- [ ] T081 **前后对比**：把 T002 的基线截图与终版并排给开发者。
      「版面改好了没有」只有这样才回答得了

---

## 依赖与并行

```
第 1 阶段 基线（T001–T003）
        ↓
第 2 阶段 共用件（T004–T013）── 十个表格页 + 八个元数据页自动到位
        ↓
   ┌────┴────────────────────────────┐
第 3 阶段 US2 地面（T014–T023）   第 4 阶段 US4 列表（T024–T031）
   └────┬────────────────────────────┘
        ↓
第 5 阶段 US1 空间（T032–T037）· 第 6 阶段 US3 字体（T038–T040）
        ↓
第 7 阶段 【AppShell 两版 —— 开发者裁定】T041–T044
        ↓
   ┌────┼────────┬────────┐
  US5   US6     US7      US8      （第 8–11 阶段，互不依赖）
   └────┴────────┴────────┘
        ↓
第 12 阶段 US9 三个没画的页面（T068–T071）
        ↓
第 13 阶段 收口（T072–T081）
```

**第 2 阶段必须最先做完**：十个表格页与八个元数据页都在共用件之上验收。

**第 7 阶段是闸，不是收尾**。侧栏的语汇（hairline 对圆角 `--well` 块）决定
其余页面怎么理解「浮起」。裁定之前不做最终收敛 —— 所以它排在 US1/US2/US3 之后、
页面级故事之前。

**第 3、4 阶段可并行**（不同文件），第 8–11 阶段可并行。

**六个需要开发者裁定的点**：T021（Alert 的 bg-card）、T043（侧栏两版裁定）、T048（分布条比例基准）、T050（时间线当前态）、T061（登录域名提示）、T071（三页确认）。
**按阶段攒批问，不逐个打断** —— 开发者明确要求过。

**MVP = 第 1–4 阶段**（T001–T031）：共用件 + 地面 + 十六页里十个表格页到位。
到这里版面已经是新的了 —— 但按决策 129，本轮**一个分支做完再发**，不中途发布。

**任务总数 81，其中 12 个标了 `[P]`，6 个是需要开发者裁定的确认点。**
