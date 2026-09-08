# 实机走查：资产详情整页与对话框改版

本轮大部分能写成 DOM 测试。**这份走查只管测试守不住的东西**：视觉、以及一个测试
和截图都发现不了的陷阱。

```
npm --prefix web run build && CGO_ENABLED=0 go build -o /tmp/nexus ./cmd/nexus
NEXUS_ADDR=:8819 NEXUS_JWT_SECRET=... NEXUS_ADMIN_EMAIL=... NEXUS_ADMIN_PASSWORD=... \
NEXUS_ALLOWED_EMAIL_DOMAINS=example.com NEXUS_DB_PATH=/tmp/qs.db /tmp/nexus
```

> 二进制里 embed 的是 `web/dist`。**改了前端必须先 `npm run build` 再 `go build`**，
> 否则跑的还是上一版界面 —— 021 踩过一次。

---

## 1. 超高对话框仍然能滚到底 ⚠️ 这一步不能省

**这是本轮唯一测试与截图都发现不了的问题。**

装饰圆需要裁切。如果裁切加在了面板上而不是装饰自己的层上，
几个内容超高、靠自身滚动的对话框会被截断 —— **不报错，只是末尾内容不见了**，
不滚到底根本看不出来。

逐个打开并**滚到最底**，确认最后一个控件还在：

- `NewAssetDialog`（录入设备，字段多时很长）
- `SettingsDialog`（设置）
- 任意一个类别字段很多的编辑对话框

```sh
# 面板本身不应出现 overflow-hidden
grep -n "overflow-hidden" web/src/components/ui/dialog.tsx
```
命中应当只在**装饰层**那一行，不在 `DialogContent` 的类名里。

## 2. 动作条通栏，且调用点没被改

打开任意带按钮的对话框：底带应当**一直铺到面板左右边缘**，与内容的内边距无关，
按钮**左对齐**，底带颜色与页面其他内容区块同色，底部两角跟随面板圆角。

```sh
git diff --stat main -- $(git diff --name-only main | grep -E 'Dialog|Editor' | grep -v components/ui)
```
20 处调用点应为空。（SC-004）

## 3. 确认框的语气分得开

**破坏性**（危险色主按钮 + 图标）：资产删除、类别删除、字段删除、账号停用、密钥吊销……

**中性**（主色按钮、无垃圾桶）：

| 打开方式 | 应当是中性 |
|---|---|
| 型号页保存 | ✓ |
| 字段编辑器里的重算 | ✓ |
| 字段编辑器里的两处解绑 | ✓ |
| 账号编辑器里的重置密码 | ✓ |

**看到「保存」弹出垃圾桶图标就是判错了。**（SC-006）

## 4. 深色批量条上的删除按钮

勾选几台设备，看浮出来的深色药丸。

删除按钮**不应是黏土色** —— 它在深色上只有 2.53:1，读不清。
应当跟着这条药丸已有的反色走（浅色文字 + 半透描边），危险性由垃圾桶图标与文案表达。

> **这是全站唯一一处破坏性动作不用破坏性颜色的地方。**
> 看起来像疏漏，其实是量出来的：设计稿只覆盖了浅色背景。
> 理由写在 FR-020、代码注释与 `docs/rules/web-tables.md` 三处 —— 不要「修正」它。

## 5. 详情页

- 整页，不是浮层；左上角有返回
- 标题下是「型号 · 厂商」，**没有**任何解释编号怎么来的句子
- 找一台没有型号的设备：副标题整行不出现，不留孤立的「·」
- 流转历史**全部在这一页**，没有「查看全部流转」按钮
- 旧地址 `/assets/:id/history` 已不存在

## 6. 筛选往返（DOM 测试已覆盖，这里只做实机确认）

带筛选的列表 → 点开一台 → 地址里带着筛选 → **刷新** → 点返回 → 筛选还在。

刷新那一步是关键：它区分「筛选存在地址里」和「筛选存在内存里」。

## 7. 对比度实测

```sh
node specs/022-detail-page-and-dialogs/contrast.mjs
```

浅色三底 ≥4.5:1，深色条上的删除按钮 ≥4.5:1。

## 8. 全量与门禁

```sh
npm --prefix web test -- --run --maxWorkers=4     # 一定要加 --maxWorkers=4
npm --prefix web run lint
npx --prefix web tsc --noEmit -p web/tsconfig.json
git diff --stat main -- internal/ cmd/            # 必须为空（SC-007）
grep -rn "fullHistory\|/history" web/src --include='*.tsx' --include='*.ts'   # 应无残留（SC-009）
```
