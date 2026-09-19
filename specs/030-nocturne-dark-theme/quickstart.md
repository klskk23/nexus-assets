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
| _（实施时填）_ | | | | |

## 预期会出现的「不改」

这些是像素对照时**一定会看到**的差异，处置在 spec 里已经定好：

| 屏 | 差异 | 决策 |
|---|---|---|
| 03 / 10 / 12 | 筛选下拉的弹出面板是 shadcn 面板，不是系统菜单 | 217 |
| 06 | 右栏没有「解绑」列与「＋ 绑定到类别」 | 218 |
| 11 / 12 | 没有表下 / 标题下的常显说明 | 219 |
| d05 | 字段由类别 schema 决定，不是原型的三个示例字段 | 222 |
| 全部 | 示例数据不同（原型是编造的产品词汇） | 231 |
