# 走查手册与差异记录

像素级还原（决策 215）的验收只能在真浏览器里做。这份文件是**怎么做**，以及做完之后
**每屏的对照结论**。截图存 `walkthrough/`，与原型并排。

## 准备

```sh
# 后端 + 前端
./nexus &                                  # :8080
(cd web && npm run dev) &                  # :5173
# 原型
(cd specs/030-nocturne-dark-theme/design && python3 -m http.server 8090) &
```

- 视口 **1440 × 900**（原型画布）。
- 登录：`curl -s -X POST :8080/api/auth/login` 取 JWT，注入 `localStorage["nexus.token"]`
  （不在浏览器里输口令）。
- 语言：先中文（`localStorage["nexus.lang"]="zh"`），全部 26 张截完再切 English 做
  不破版检查。
- 原型：`http://localhost:8090/prototype.dc.html`，用它左侧导航切屏；弹窗从原型对应
  按钮打开。

## 每屏的截图动作

| # | 屏 | 应用地址 / 动作 | 原型动作 | 文件 |
|---|---|---|---|---|
| 01 | 登录 | 清 token 后开 `/` | 首屏 | `01-login.png` |
| 02 | 概览 | `/` | 概览 | `02-overview.png` |
| 03 | 资产列表 | `/assets`，勾选 1 行使批量栏出现 | 资产 → 勾一行 | `03-assets.png` |
| 04 | 设备详情 | `/assets/<id>`（选一台有流转历史的） | 点第一行 | `04-asset-detail.png` |
| 05 | 类别 | `/categories/<第一个根>` | 类别 | `05-categories.png` |
| 06 | 字段 | `/fields/<第一个>` | 字段 | `06-fields.png` |
| 07 | 型号 | `/models/<第一个型号>` | 型号 | `07-models.png` |
| 08 | 状态 | `/statuses` | 状态 | `08-statuses.png` |
| 09 | 持有方 | `/holders/<第一个根>` | 持有方 | `09-holders.png` |
| 10 | 账号 | `/users` | 账号 | `10-users.png` |
| 11 | 角色 | `/roles` | 角色 | `11-roles.png` |
| 12 | 操作审计 | `/audit` | 审计 | `12-audit.png` |
| 13 | 流转审计 | `/audit/transfers` | 审计 → 流转 | `13-audit-transfers.png` |

弹窗（从对应屏打开，截含遮罩的整屏）：

| # | 弹窗 | 从哪开 | 文件 |
|---|---|---|---|
| d01 | 设置 | 导航底部账号按钮 | `d01-settings.png` |
| d02 | 流转 | 03 批量栏「签出」 | `d02-transfer.png` |
| d03 | 新建 / 编辑状态 | 08 点一行 | `d03-status.png` |
| d04 | 编辑类别 | 05 「编辑类别」 | `d04-category-edit.png` |
| d05 | 录入设备 | 03 「录入设备」，选一个类别 | `d05-asset-new.png` |
| d06 | 编辑账号 | 10 点一行 | `d06-user-edit.png` |
| d07 | 编辑角色 | 11 点一行 | `d07-role-edit.png` |
| d08 | 变更内容 | 12 点一行 | `d08-audit-diff.png` |
| d09 | 确认（type-to-confirm） | d04 「删除类别」 | `d09-confirm.png` |
| d10 | 批量导入 | 03 「批量导入」 | `d10-import.png` |
| d11 | 打印标签 | 03 批量栏「打印标签」 | `d11-print.png` |
| d12 | 导出 | 03 「导出 CSV」 | `d12-export.png` |
| d13 | 表达式怎么写 | 06 选一个计算字段 → 「怎么写」 | `d13-expression-help.png` |

截图片段（Playwright MCP `browser_run_code_unsafe`）：

```js
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto("http://localhost:5173/assets"); await page.waitForTimeout(1500)
await page.screenshot({ path: "<绝对路径>/walkthrough/03-assets.png" })
```

## 量化检查（每屏截图之外）

```js
// 焦点环：真键盘。element.focus() 不触发 :focus-visible。
await page.keyboard.press("Tab")
const ring = await page.evaluate(() => {
  const el = document.activeElement
  const cs = getComputedStyle(el)
  return { outline: cs.outlineColor, width: cs.outlineWidth, offset: cs.outlineOffset }
})
// 期望 width "2px"、outline 为 --ring 的 rgb

// 药丸不换行（English 下）
const broken = await page.evaluate(() =>
  [...document.querySelectorAll("button, [data-slot=badge], th, [role=radio] + label, label")]
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.textContent?.trim().slice(0, 30)))
// 期望 []

// 导航宽度
await page.evaluate(() => document.querySelector("nav")!.closest("[data-slot=rail]")!.getBoundingClientRect().width)
// 展开 216、折叠 60
```

对比度（焦点环对 bg 与 surface）：取 `--ring`、`--background`、`--card` 的 computed 值，
按 WCAG 相对亮度算；期望 **5.46 / 4.71**，门槛 3:1。

## 差异记录

处置只有三种：**已改** / **不改，引用决策 21x** / **报告**（交接文档自身的问题，
交给开发者，不私自调）。

| 屏 | 项 | 原型值 | 实测值 | 处置 |
|---|---|---|---|---|
| 壳 | 侧栏宽 / 折叠宽 | 216 / 60 | 216 / 60 | 已改 |
| 壳 | 内容区内边距 | 26 36 64 32 | 26 36 64 32 | 已改 |
| 壳 | 焦点环 | 2px `--accent`，offset 2 | `2px solid rgb(145,132,217)`，offset 2px（真键盘 Tab） | 已改 |
| 壳 | 焦点环对比 | ≥ 3:1 | 对地 5.45、对面 4.71 | 已改 |
| 01 | 登录卡宽 / 按钮高 | 420 / 40 | 420 / 40 | 已改 |
| 02 | 三卡栅格 / 卡内距 | `minmax(300px,1fr)` gap 16 / 18 20 | 同 | 已改 |
| 02 | 最近流转每页 | 5 / 10 / 20 | 5 / 10 / 20 | 已改 |
| 03 | 筛选行控件高 / 搜索宽 | 34 / 260 | 34 / 260 | 已改 |
| 03 | 每页 | 20 / 50 / 100 | 20 / 50 / 100 | 已改（原 10 / 20 / 50） |
| 03 | 筛选下拉的弹层 | 原生 `select` | shadcn `Select` / `SearchSelect` | 不改，决策 217 |
| 03 | 批量栏动词 | 签出 / 归还 / 转移 + 打印 / 导出 / 删除 | 同 | 已改（020 的「只放四个」作废） |
| 04 | 内容宽 / 分区 | 1100 / 30 | 1100 / 30 | 已改 |
| 04 | 删除入口 | 页头四按钮里 | 页头（红 ghost + 确认框） | 已改 |
| 05 | 新建类别位置 | 页头右上 | 页头右上（024 曾放在树脚） | 已改 |
| 05 | 右栏形制 | card 20 24 / 名称 20 / 事实带 | 同（`Pane`） | 已改 |
| 06 | 「解绑」列、「＋ 绑定到类别」 | 有 | 无 | 不改，决策 218 |
| 06 | 表达式块 | `code` 左 2px accent、`accent-300` | 同 | 已改 |
| 07 | 右栏两栏 | 默认值表 / 字段表 | 同；字段表两列（显示名 / 来源），键名不再列 | 已改 |
| 08 | 搜索框 | 裸 `input` max-w 360 | `ListToolbar`（带放大镜，260） | 不改：表格页的一条搜索工具栏是 `web-tables.md` 的既有规则，原型的裸输入框不构成推翻它的理由 |
| 09 | 默认库存点 | 树下 12px | 树下 12px（原在页头） | 已改 |
| 09 | 行内顺序 | 名称 · 类型 · 数量 | 名称 · 数量 · 类型 | 报告：`RailRow` 的数字槽在链接内，类型标签在链接外；把类型塞进链接要动共用件，先记下 |
| 10 | 登录方式列 | 有 | 有（`auth_type`） | 已改 |
| 11 | 表下说明 | 有 | 无，收进 ⓘ | 不改，决策 219 |
| 11 | 权限列 | 「N 项」+ 前 4 项 | 同 | 已改 |
| 12 | 标题下说明 | 有 | 无，收进 ⓘ | 不改，决策 219 |
| 12 / 13 | 「共 N 条」「清除筛选」 | 有 | 有 | 已改 |
| d01 | 语言 `.seg` / 密钥按钮 28 / 主题项 | 有 / 28 / 无 | `ToggleGroup` / `xs`=28 / 无 | 已改 |
| d02 | 标题后缀 / 动作 `.seg` | 13px 后缀 / 联体 | 后缀已改；动作段带 `spacing` 可换行 | 不改换行：`dialogTrack` 规则（英文 483 > 446） |
| d04 | 字段表 | 无 | 无（挪到右栏） | 已改 |
| d05 | 字段 | 三个示例字段 | 按类别 schema | 不改，决策 222 |
| d09 | 告警图标 | 无（红缘 + 红描边按钮） | 无（`data-tone` 红缘） | 已改 |
| d10 | 汇总条颜色 | 琥珀 | `accent-900 / accent-200` | 不改：状态槽位不画非状态（FR-004） |
| d10 | 预览表 | 全部行 + 问题列 | 只列出错行 | 不改：预览接口只回出错行的字段错误 |
| d13 | 容器 | 640 弹窗 | 640 抽屉（右侧） | 不改：帮助要在写表达式时并排看，抽屉是 025 定的形制 |
| 全部 | `--destructive` 红字对比 | `oklch(0.72 0.12 20)` | 对 `--card` 3.04:1、对地 3.52:1（< 4.5） | 不改：开发者 2026-09-19 裁定接受原型的值（换成 `oklch(0.80 0.12 20)` 可到 4.87:1，留作后手） |
| 全部 | 示例数据 | 编造的产品词汇 | 演示库数据 | 不改，决策 231 |
| 全部 | 原型运行时 | `support.js` + `_ds_bundle.js` | 已从重新提供的 zip 放回 `design/` | 已改 |

**量化结果**（1440×900，2026-09-19）：

| 项 | 结果 |
|---|---|
| 13 屏中文截图 | `walkthrough/01-login.png` … `13-audit-transfers.png` 齐（02 另有折叠态 `02b`） |
| 13 弹窗截图 | `d01` … `d13` 齐，宽度实测 = 原型（440–680） |
| English 不破版 | 13 屏 + 13 弹窗 `scrollWidth > clientWidth` 均为 0；`nowrap` 元素溢出 0；弹窗底栏距面板右缘 24px（= 面板内边距） |
| 弹窗内浮层滚轮（029） | 录入设备的持有方下拉：滚轮 240 → `scrollTop` 0 → 240（列表 1256 / 256） |
| bundle | `index-*.js` gzip **202.6 KB**（≤ 512 KB）；全部 js gzip 316 KB；`index-*.css` gzip 159 KB（Noto 三个字重的 `unicode-range` 声明） |
| woff2 | 产物 301 文件、**7.51 MB**：Inter wght 0.22 MB + Noto 400/500/700 各约 2.43 MB。**相对 v0.16.0 增量约 +2.4 MB**（新增 Noto 500 一整个字重 2.43 MB + Inter 0.22 MB − Figtree/Caprasimo 约 0.3 MB），**超出 ≤ 2 MB 的预算** —— 但这是产物体积，不是传输量：每个字重按 `unicode-range` 切成 100 个子集，页面只取用到的几个。开发者 2026-09-19 裁定**接受**（决策 224 要真字重；预算线按此结果改为「产物 woff2 ≤ 8 MB、`index-*.js` gzip ≤ 512 KB」） |
| Go 门禁 | `gofmt -l` 空、`go vet` 空、`go test ./...` 全过（服务端零改动） |
| 前端门禁 | `tsc` 空、`eslint` 空、`vitest --maxWorkers=4` 61 文件 520 全过、`npm run build` 通过 |

## 预期会出现的「不改」

这些是像素对照时**一定会看到**的差异，处置在 spec 里已经定好：

| 屏 | 差异 | 决策 |
|---|---|---|
| 03 / 10 / 12 | 筛选下拉的弹出面板是 shadcn 面板，不是系统菜单 | 217 |
| 06 | 右栏没有「解绑」列与「＋ 绑定到类别」 | 218 |
| 11 / 12 | 没有表下 / 标题下的常显说明 | 219 |
| d05 | 字段由类别 schema 决定，不是原型的三个示例字段 | 222 |
| 全部 | 示例数据不同（原型是编造的产品词汇） | 231 |
