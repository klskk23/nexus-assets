# 任务：Organic 风格前端重构

**规格**：[spec.md](./spec.md) ｜ **计划**：[plan.md](./plan.md) ｜ **调研**：[research.md](./research.md) ｜ **决策**：114–121

`[P]` = 可与相邻任务并行（不同文件、无未完成依赖）。
`[US1]`–`[US5]` = 服务于哪个用户故事。

**跑测试一律加 `--maxWorkers=4`** —— 默认并发会把这台机器打满，
worker 集体 45 秒超时，看起来像十几个测试同时坏了。

---

## 第 1 阶段：字体管线（与第 2 阶段并行，但必须在第一次视觉验收前就位）

- [x] T001 取三款字体的 woff2 与许可：Caprasimo、Figtree（拉丁）、Noto Sans SC（中文）。
      三款均为 SIL OFL，**许可文件必须一同落库**，放 `web/src/assets/fonts/`
- [x] T002 中文字体按 **unicode-range 分片**（research.md 第四节：按用字裁剪会让用户输入的
      设备名落到回退字体，同一页两种字形）。分片产物与拉丁两款一起进 `web/src/assets/fonts/`
- [x] T003 在 `web/src/index.css` 写 `@font-face`：三款各自的 `font-family`、`font-display: swap`、
      中文的 `unicode-range` 分片声明。**不得出现任何指向 fonts.googleapis.com / fonts.gstatic.com 的 `@import`**
- [x] T004 `--font-heading` / `--font-body` 接进 Tailwind 的字体族；中文回退栈跟在拉丁之后。
      标题用 700 并设 `font-synthesis-weight: none`，避免没有中文字形的标题字体被合成加粗
- [x] T005 **量体积**：`npm run build` 后看 `dist/` 增量，再 `CGO_ENABLED=0 go build` 看二进制增量。
      **超过 8 MB 就停下来找开发者**（SC-009 是唯一预留的翻案点：修订规格，不是放宽验收）

## 第 2 阶段：地基（阻塞所有用户故事）

- [x] T006 `web/src/index.css`：按 research.md 第一节的映射表，把 `:root` 的十九个语义变量
      换成 Organic 的值。**只改值，不改变量名** —— 组件里的 `bg-primary` 等类名一个不动
- [x] T007 `web/src/index.css`：`--radius` 提到 `28px` 供盒子使用（卡片、对话框、面板）。
      药丸不走这个变量（见 T010）
- [x] T008 `web/src/index.css`：`--chart-1` 换成 Organic 的沙绿 `#8fa073`，**删掉深色版那行**。
      沙绿与陶土橙拉得开，且不与八个状态调色板的任何色相撞
- [x] T009 `web/src/index.css`：八个 `.status-*` 调色板按新底色复核对比度。
      它们原是为白底校的，奶油底会削弱对比。**区分不得只靠颜色**（FR-005）
- [x] T010 `web/src/components/ui/`：把九个小控件的圆角改成药丸（`rounded-full`）——
      button、badge、input、textarea、select trigger、toggle、toggle-group、tabs trigger、input-group。
      **每改完一个立刻跑一次测试**，不攒到最后（Radix 不动就不掉 role，但顺手改了元素类型就会）
- [x] T011 每个改成药丸的控件加 `white-space: nowrap`。英文比中文长，
      不加的话窄屏与英文界面下药丸里的字会换行
- [x] T012 `web/src/components/ui/`：删除 15 个文件里的 25 处 `dark:` 工具类
- [x] T013 `web/src/components/ui/sonner.tsx`：摘掉 `next-themes`，固定为浅色
- [x] T014 `web/src/index.css`：删 `@custom-variant dark`、两组 `.dark` 块、八行 `.dark .status-*`
- [x] T015 删 `web/src/features/theme/useTheme.tsx`，并摘除它在 `main.tsx`、
      `routes/AppShell.tsx`（深浅切换按钮）、`features/settings/SettingsDialog.tsx`、
      `features/settings/usePreferences.ts`、`web/src/test/renderWithProviders.tsx` 里的引用
- [x] T016 `package.json` 移除 `next-themes`；删 `web/tests/theme.test.tsx`
- [x] T017 两份 i18n 移除 `nav.toLight` / `nav.toDark` 与设置里的主题项。
      `tests/i18n.test.ts` 的孤儿检查会抓到没删干净的条目
- [x] T018 **服务端不动**：确认 `users.theme` 字段、相关端点与迁移**一行都没改**（FR-002/FR-028）
- [x] T019 `grep -rn "dark:" web/src` 应命中零处；`grep -rn "next-themes" web/src package.json` 同样

## 第 3 阶段：US1 全站视觉统一（P1，MVP）

**独立验收**：打开任意页面，外壳、按钮、输入框、面板、表格都是 Organic 形态；
断网刷新字体不变。

- [x] T020 [P] [US1] `web/tests/appShell.test.tsx` 新建或补充：导航栏**没有**深浅切换按钮；
      设置对话框**没有**主题选项（先写，此时应当已经通过 —— T015 已经拆掉）
- [x] T021 [US1] `web/src/routes/AppShell.tsx`：左侧栏改 Organic 形态（固定宽、主区大圆角、
      独立滚动）。**侧栏与主区都要 `min-height: 0`**，否则主区不产生滚动容器
- [x] T022 [US1] `web/src/features/common/PageHeader.tsx`、`TableFrame.tsx`：Organic 形态
- [x] T023 [US1] `web/src/features/common/Pager.tsx`、`ListToolbar.tsx`：Organic 形态。
      **翻页仍是一整行放在表格下方，筛选仍是一栏** —— 形状变了，约定不变
- [x] T024 [US1] `web/src/routes/Login.tsx`：按稿子重排（两列、圆形色块、登录卡大圆角）。
      **域名限制提示必须在提交前可见** —— 它是 v1 唯一的准入边界
- [x] T025 [US1] 断网走查：拦掉 `fonts.googleapis.com` 与 `fonts.gstatic.com` 后硬刷新，
      确认字体不回退（quickstart 第 2 步）
- [x] T026 [US1] **键盘走查**：从页头 Tab 到页尾，每个可交互元素都到得了，
      焦点环在奶油底上始终看得见（SC-008）。陶土橙焦点环的对比度是这一步的重点

## 第 4 阶段：US2 资产页的选择与批量（P1）

**独立验收**：三种选中方式各用一次计数正确；改筛选不丢选；单台操作零勾选。

- [x] T027 [P] [US2] `web/tests/assets.test.tsx` 加测试：点表头勾选框全选本页，
      表格下方出现「选中符合当前筛选的全部 N 条」横幅（FR-012/FR-013）
- [x] T028 [P] [US2] 同上加测试：Shift 连选一段、再 Shift 取消一段（FR-014）
- [x] T029 [P] [US2] 同上加测试：改变筛选后**选中集不丢**，批量条计数如实反映（FR-015/SC-005）
- [x] T030 [P] [US2] 同上加测试：点行尾按钮**不触发进入详情**（FR-017）
- [x] T031 [P] [US2] 同上加测试：选中数为零时**没有**批量条；大于零时出现（FR-018）
- [x] T032 [P] [US2] 同上加测试：筛选无命中时显示空态且能一键清除筛选
- [x] T033 [US2] `web/src/features/assets/useSelection.ts` 新建：选中集以**资产 id 为键**
      （不是行下标），提供全选本页、扩选全部、Shift 连选（锚点是可见行序号）。
      筛选与翻页变化时选中集不变
- [x] T034 [US2] `web/src/features/assets/SelectAllBanner.tsx` 新建：全选本页后出现的横幅，
      含「选中符合当前筛选的全部 N 条」与「按住 Shift 可连选」提示。**N 取列表接口已返回的 `total`**
- [x] T035 [US2] ~~新建 `BulkBar.tsx`~~ **改为沿用既有的 `ActionBar.tsx`** —— 它已经是「勾选后浮起的一行」，
      再造一个就是 FR-011 禁止的第二套零件。批量条（已选 N 台 +
      清空 + 各项批量动作）。仅在 N>0 时出现；表格容器留出底部内边距，**不遮住最后一行**（FR-019）
- [x] T036 [US2] `web/src/routes/Assets.tsx`：接上以上三者；行尾 hover 出打印标签 /
      变更状态 / 查看详情三个圆形图标按钮，`onClick` 里 `stopPropagation()`。
      **这三个按钮要有 `aria-label`** —— 图标按钮没有可读名字就等于键盘用户看不见
- [x] T037 [US2] 两份 i18n 补齐本阶段新增文案（批量条、横幅、三个 `aria-label`）
- [x] T038 [US2] `web/tests/assets.test.tsx` 加**地址栏回归**：筛选与页码仍写进地址栏，
      且用 `replace` 不用 `push`（FR-025）。这条在重做选择模型时**最容易碰坏且不会报错** ——
      坏掉的表现是「点进一台设备再返回，筛选全没了」，跑测试是绿的。
      比较 `useSearchParams()` 的值，不要读 `window.location`

## 第 5 阶段：US3 概览页（P2）

- [x] T039 [P] [US3] **找开发者确认三个自定义组件：统计卡、类别分布条、状态流转时间线**
      （章程原则三：不存在的组件必须先确认，不接受事后补批）。三个一次问完 ——
      前两个属于概览页，时间线属于资产详情（第 7 阶段），但确认是一次对话不是三次
- [x] T040 [P] [US3] `web/tests/overview.test.tsx` 加测试：统计卡数字与对应筛选下的列表条数一致；
      分布条的填充比例与台数占比相符；「待我处理」每条可跳转
- [x] T041 [US3] `web/src/features/overview/StatCard.tsx` 新建（确认后）
- [x] T042 [US3] `web/src/features/overview/DistributionBar.tsx` 新建（确认后）。
      **填充块必须 `display: block`**，否则百分比宽度不生效；数值右对齐且 `tabular-nums`
- [x] T043 [US3] `web/src/routes/Overview.tsx`：按稿子重排（标题行 → 四张统计卡 →
      左分布右待办的两列）。图表仍走 `lazy` + `Suspense`，**不得把 recharts 拉回入口 chunk**

## 第 6 阶段：US4 八个元数据页（P2）

- [ ] T044 [US4] `web/src/features/metadata/CrudPage.tsx`：Organic 形态。
      **改这一个，八个页面一起变** —— 字段、字段组、型号、厂商、状态、持有方、账号、角色
- [ ] T045 [US4] 跑八个页面的既有测试，确认**点击行编辑、右键出菜单、对话框内显示拒绝**
      三条行为一字未变（FR-021/FR-023/FR-026）
- [ ] T046 [US4] 逐页截图，**给开发者确认形态**（plan.md 的裁决权约定：
      稿子没画这四个页面，形态由实现者推导后交开发者判定）

## 第 7 阶段：US5 资产详情与全量历史（P2）

**独立验收**：点进一台设备是新外观，关闭后筛选与页码原样还在；
时间线三态在灰度下仍可分。

- [ ] T047 [P] [US5] `web/tests/assetDetail.test.tsx` 加测试：关闭详情对话框后
      **列表的筛选与页码没丢**（`navigate({pathname:"/assets", search})`，FR-029）
- [ ] T048 [P] [US5] 同上加测试：时间线的已完成 / 当前 / 未来三态**不依赖颜色**也能分辨（FR-005）
- [ ] T049 [US5] `web/src/features/assets/StatusTimeline.tsx` 新建（T038 确认后）。
      三态靠图形区分：已完成实心圆 + 实线、当前描边圆 + 主色环、未来空心圆 + 虚线
- [ ] T050 [US5] `web/src/features/assets/AssetDetail.tsx`：Organic 形态；接上时间线。
      **对话框里只放最近 5 条流转**，全量历史仍在另一条路由（014 决策 89，不变）
- [ ] T051 [US5] `web/src/routes/AssetHistory.tsx`：整页历史的视觉跟上（FR-030）

## 第 8 阶段：US6 类别页与审计页（P3）

- [ ] T052 [P] [US6] `web/src/routes/Categories.tsx`：视觉重排。
      **不翻页、搜索时从树切平铺、清空恢复成树** —— 行为一字不变（FR-022）
- [ ] T053 [P] [US6] `web/src/routes/Audit.tsx`：视觉重排；前后值用绿/橙底标出新旧。
      **且区分不得只靠颜色** —— 加删除线/下划线之类的形状差异（FR-005）
- [ ] T054 [US6] `web/tests/audit.test.tsx` 加测试：新旧值的区分在不依赖颜色时仍然成立
- [ ] T055 [P] [US6] `web/src/routes/Import.tsx`：视觉跟上（流程页，不改流程）

## 第 9 阶段：收口

- [ ] T056 **静态检查两条**：`grep -rn "#[0-9a-fA-F]\{6\}" web/src/routes web/src/features --include='*.tsx'`
      应为**零命中**（FR-003，改造前实测就是零，别在这一轮引入第一处）；
      且 `ListToolbar` / `useListQuery` / `Pager` / `CrudPage` **各自只有一份实现**，
      没有为某一页复制出变体（FR-011）
- [ ] T057 两份 i18n 全量复核：新增文案两种语言齐全；`tests/i18n.test.ts` 的孤儿检查为零
- [ ] T058 **英文界面逐页走查**：十四个路由在英文下没有文字溢出、
      药丸里没有换行、统计卡数字没有挤出（SC-007）
- [ ] T059 `docs/rules/web-forms.md` 与 `web-tables.md` 更新：药丸形态、圆角两档、
      深色已下架、字体自托管 —— 让下一个人不必重新发现
- [ ] T060 `CLAUDE.md` 复核：深色相关的表述清理干净
- [ ] T061 跑完整门禁（章程七条）：`gofmt -l` 空、`go vet`、`golangci-lint` 零告警；
      `go test ./...` 全过且核心包覆盖率 ≥ 80%（本轮不碰 Go，应当原样通过）；
      `nexus verify` 通过；`npx tsc --noEmit`、`eslint`、`vitest run --maxWorkers=4`、
      `npm run build` 全过；真镜像 `deploy/smoke.sh` 通过
- [ ] T062 按 [quickstart.md](./quickstart.md) 实机走完 17 步。
      **第 2 步必须断网做**，第 3 步必须量真实产物

---

## 依赖与并行

```
第 1 阶段 字体（T001–T005）─┐
                            ├─ 必须都完成，才能开始视觉验收
第 2 阶段 地基（T006–T019）─┘
        │
        ├─ 第 3 阶段 US1 全站外壳 ── 第 4 阶段 US2 资产页选择模型
        ├─ 第 5 阶段 US3 概览 ──┐
        ├─ 第 6 阶段 US4 八个元数据页（改一个共用件）
        ├─ 第 7 阶段 US5 资产详情与全量历史 ←┘（时间线与概览两件一起确认）
        └─ 第 8 阶段 US6 类别 / 审计 / 导入
                    │
              第 9 阶段 收口
```

**T006 必须最先做完**：后面每一步都在新 token 上验收，先改组件再换 token 等于每个组件看两遍。

**字体（第 1 阶段）与地基（第 2 阶段）可并行**，但字体必须在第一次视觉验收（T025 之前的任何截图）前就位 —— 否则看到的是回退字体，会误判形态。

**第 4 阶段放在第 3 阶段之后**：资产页的选择模型是唯一改变操作方式的部分，
要在已经换好皮的表格上验收，否则视觉问题与交互问题混在一起看不清。

**第 5、6、7、8 阶段互不依赖**，可并行，也可只做一条就验收。
唯一的跨阶段依赖是 **T038 → T048**：时间线组件的确认在第 5 阶段一次问完。

**T038 是一道闸**：三个自定义组件（统计卡、分布条、状态流转时间线）
必须在动手前得到确认（章程原则三）。第 5 阶段的其余任务与 T048 都堵在它后面。

**MVP = 第 1、2、3 阶段**（T001–T026）：全站视觉到位、深色下架、字体自托管。
到这里 US1 完整可验收 —— 但按决策 121，本轮**一个分支做完再发**，不中途发布。

**任务总数 62，其中 14 个标了 `[P]`。**
