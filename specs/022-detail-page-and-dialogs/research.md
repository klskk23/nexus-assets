# Phase 0 调研：详情整页与对话框改版

四个问题。前两个决定拆解方式，后两个是稿子没画到、必须自己定的地方。

---

## 问题一：详情从子路由变顶层路由，要动多少处？

### 现状

```
path: "assets"                    ← 列表
  children: [ path: ":id" ]       ← 详情，作为子路由渲染成 dialog
path: "assets/:id/history"        ← 历史，独立顶层
```

`AssetDetail.tsx` 533 行，其中 dialog 相关的只有三处：外层 `<Dialog>`/`<DialogContent>`、
`DialogHeader`/`DialogTitle`、以及 `close()` 里的 `navigate({pathname:"/assets", search})`。
**其余 500 行是内容，与它装在什么容器里无关。**

### 进入详情的入口（全部要带上列表状态判断）

| 位置 | 入口 | 带筛选？ |
|---|---|---|
| `Assets.tsx:668` | 行点击 | **要带** |
| `Assets.tsx:753` | 行尾按钮 | **要带** |
| `Assets.tsx:310` | 扫码精确命中 | 不带 |
| `Assets.tsx:767` | 右键「查看全部历史」 | **整条删掉** |
| `NewAssetDialog` | 录入完成跳新设备 | 不带 |
| 审计页 | 「只看这个对象」 | 不带 |

### 结论

改动集中在**路由表 + 三处容器代码 + 两处列表导航**。
`Assets.tsx:767` 那条右键菜单项随历史页一起删。

**列表状态的搬运**：列表本来就用 `useSearchParams` 把筛选写在地址里，
所以「带上」就是把当前 `location.search` 原样拼到详情地址后面，
「带回」就是把详情地址的 search 原样拼回 `/assets`。**没有新机制。**

---

## 问题二：全部历史合并，代价是多少？

**零。** 两个页面拉的是同样两个请求：

```
GET /assets/:id            → DetailResponse
GET /assets/:id/transfers  → Transfer[]
```

服务端 `listAssetTransfers` 无 `limit`/`offset`，**一次返回全部**。
详情页早就把全部事件拿在手里，只是客户端切了最后 5 条。
合并 = 不切。删掉 `AssetHistory.tsx`（82 行）少一个发同样请求的页面。

当初拆开的理由写在代码注释里：「四十条事件塞进 dialog，是盒子里套一页，两层滚动条」——
**随 dialog 一起失效**。

---

## 问题三：动作条要全宽底带，但面板有内边距，怎么办？

### 冲突

`DialogContent` 现在是 `p-8`，内容与面板边之间有 32px。
稿子的动作条是**通栏**的 well 色底带，一直到面板左右边缘。
若把 `p-8` 拿掉改由各处自己加，**20 处调用点全要改** —— 违反 FR-015。

### 方案比较

| | 做法 | 判断 |
|---|---|---|
| A | 去掉容器 `p-8`，各调用点自己加 | **否** — 违反 FR-015，且以后每新增一处都要记得 |
| B | `DialogFooter` 用负外边距突破容器内边距 | **采用** — 容器不动，调用点不动，只改 footer 一个组件 |
| C | 把面板拆成 header/body/footer 三段栅格 | 否 — 需要调用点按段落组织 children，等于 A |

**选 B**：`DialogFooter` 加 `-mx-8 -mb-8`（抵消容器内边距）+ 自己的内边距 + `bg-well` +
底部圆角。没有 `DialogFooter` 的对话框自然没有底带，不受影响。

---

## 问题四：装饰圆要裁切，但面板不能 `overflow-hidden`

### 陷阱

稿子的装饰圆是 `position:absolute; top:-72px; right:-56px`，靠父级 `overflow:hidden` 裁成四分之一。

**但 `DialogContent` 不能加 `overflow-hidden`**：好几个对话框内容超高，
靠自身滚动（`AssetDetail` 用的是 `max-h-[85vh] overflow-y-auto`，
`NewAssetDialog`、`SettingsDialog` 同类）。加了 `overflow-hidden` 会把它们的滚动废掉，
症状是内容被截断而不是报错 —— **看不出来，只有滚到底才发现少东西**。

### 结论

装饰圆放进一个**自己的裁切层**：

```
<div aria-hidden class="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
  <div class="absolute -top-16 -right-14 size-44 rounded-full bg-… opacity-…" />
</div>
```

`inset-0` + 自己的 `overflow-hidden` + 与面板一致的圆角。
只裁装饰，不碰内容的滚动。`pointer-events-none` 保证它不吃点击。

---

## 顺带确认的两件事

**破坏性色的对比度**（本轮之前已量，此处存档）：

| 前景 / 背景 | 比值 | 现状对照 |
|---|---|---|
| `#8f4a35` / 页面底 `#f9f4ed` | **6.00** | 现红 4.36 |
| `#8f4a35` / well `#f5ead8` | 5.52 | |
| `#8f4a35` / card `#ebddc5` | 4.90 | |
| `#fdf6ea` / `#8f4a35`（按钮内） | 6.11 | |
| **`#8f4a35` / 深色条 `#201e1d`** | **2.53** | 现红 3.48，**两者都不达标** |
| `#8f4a35` / 主色 `#c67139` | 1.82 | 现红 vs 主色 3.4 |

深色条那一行是 FR-020 的全部依据：稿子只画了浅色背景，
而那条药丸的底是 `--foreground`。**换色会让一个已经不达标的地方更不达标。**

**`ConfirmDialog` 并非只用于破坏性操作** —— 13 处调用里有 4 处不是：

| 调用处 | 动作 |
|---|---|
| `Models.tsx:437` | 保存 |
| `FieldEditor.tsx:389` | 重算 |
| `FieldEditor.tsx:398` / `:411` | 解绑 |
| `UserEditor.tsx:235` | 重置密码 |

稿子只画了删除那一种。无条件套用会让「保存」弹出垃圾桶图标 —— 这是 FR-018 的依据。
