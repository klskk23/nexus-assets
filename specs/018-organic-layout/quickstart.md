# 实机走查：Organic 版面重做

起一个本地实例，按顺序走完。这一轮**测试守不住版面**：367 条测试里只有一条
碰过尺寸类（概览页那条 `grid-cols-[...]`），而它在实现阶段既没挡住错误、
又在版面正确时报了红 —— 已改成断言行为。所以这份走查不是补充验证，
**它就是主要的验收手段**。

带尺子走 —— 「看起来对」不算，量出来才算。浏览器 DevTools 的 Computed 面板，
或直接在控制台 `getComputedStyle(el)`。

```
CGO_ENABLED=0 go build -o /tmp/nexus ./cmd/nexus
NEXUS_JWT_SECRET=... NEXUS_ADMIN_EMAIL=... NEXUS_ADMIN_PASSWORD=... \
NEXUS_ALLOWED_EMAIL_DOMAINS=example.com NEXUS_DB_PATH=/tmp/qs018.db /tmp/nexus seed 60
```

## 尺子

把这一段贴进控制台，下面每一步都用它量。**目测不算验收** ——
这一轮改的全部是数字，而人眼分不出 44 和 48。

```js
// 令牌名反查：把量到的颜色说成人话，而不是一串 rgb
const GROUND = {
  'rgb(245, 234, 216)': '--background 页面',
  'rgb(235, 221, 197)': '--card 浮起',
  'rgb(249, 244, 237)': '--well 下沉',
  'rgb(238, 231, 219)': '--secondary 次级',
  'rgba(0, 0, 0, 0)': '透明（继承父级）',
}
const px = (v) => Math.round(parseFloat(v) * 100) / 100

// ruler('td') —— 一个选择器的盒子读数
window.ruler = (sel) => {
  const rows = [...document.querySelectorAll(sel)].slice(0, 8).map((e) => {
    const s = getComputedStyle(e)
    return {
      高: px(e.getBoundingClientRect().height),
      宽: px(e.getBoundingClientRect().width),
      内边距: `${px(s.paddingTop)}/${px(s.paddingRight)}/${px(s.paddingBottom)}/${px(s.paddingLeft)}`,
      圆角: px(s.borderRadius),
      字号: px(s.fontSize),
      字重: s.fontWeight,
      底: GROUND[s.backgroundColor] ?? s.backgroundColor,
    }
  })
  console.table(rows)
  return rows
}

// gaps('main > *') —— 相邻分区的实测间距（外边距会塌陷，所以量边到边）
window.gaps = (sel) => {
  const el = [...document.querySelectorAll(sel)]
  const out = el.slice(1).map((e, i) => ({
    从: el[i].className.slice(0, 40) || el[i].tagName,
    到: e.className.slice(0, 40) || e.tagName,
    间距: px(e.getBoundingClientRect().top - el[i].getBoundingClientRect().bottom),
  }))
  console.table(out)
  return out
}

// grounds() —— 全站地面普查。--card 的每一处命中都要能回答「它浮起来了吗」
window.grounds = () => {
  const hit = {}
  for (const e of document.querySelectorAll('*')) {
    const bg = getComputedStyle(e).backgroundColor
    if (bg === 'rgba(0, 0, 0, 0)') continue
    ;(hit[GROUND[bg] ?? bg] ??= []).push(e.className || e.tagName)
  }
  for (const [k, v] of Object.entries(hit)) console.log(k, v.length, v.slice(0, 12))
  return hit
}
```

三个函数覆盖这份走查里的全部读数：`ruler` 量盒子（行高、内边距、圆角、字重），
`gaps` 量节奏（分区 56、成组 22–24），`grounds` 查地面分工。

### 改造前的读数（2026-09-08，1920×1000 的资产列表）

这些是**动第一行代码之前**用上面的尺子量出来的，不是估的。
走查时拿新读数对着这一列看：

| 量什么 | 改造前 | 目标 |
|---|---|---|
| `tbody td` 高 | **45px** | 48px |
| `tbody td` 内边距 | **6/0/6/8** | 15/20/15/20 |
| `thead th` 高 / 字重 | **36px / 500** | 由内边距得出 / 600 |
| 内容列宽（窗口 1920） | **1616px** —— 无上限 | 贴左、右侧留白（**018 的目标是 ≤960px；020 已改成按面板比例流动，960 变成地板**） |
| `--card` 命中数 | **2**（表格框、外壳） | 只剩真正浮起的东西 |

**「内容列 1616px」这一条最能说明这一轮在改什么**：它不是「居中列太窄」，
是根本没有边界（research 第一节）。

---

**1. 内容列贴左且右侧留白。**
在 1920px 宽的窗口打开资产列表。内容列**不顶到右边**，左侧紧贴主区内边距，
**右侧是留白**。**内容一路顶到右边即不通过。**（FR-001 / SC-001）

> **⚠️ 这一步的数字已被 020 取代。** 018 写的是「宽度 ≤960px」，
> 以及正文 760、表单 620–640 三档。020 拆掉了固定上限与逐页宽度：
> 现在是 `w-[min(100%,max(960px,76%))]` 一条规则，**960 是地板不是上限**，
> 而且**只有一档**。要量宽度请跑
> `node specs/020-fluid-content-column/measure.mjs`。

**2. 分区之间是 56px。**
概览页量「设备状态」区底 到「类别分布」区顶 的距离 —— 56px。
再量区内成组（比如五张状态卡之间）—— 22–24px。
**两者相同即不通过** —— 那正是 017 的状态（清一色 24px）。（FR-002）

**3. 圆角容器的内边距 ≥24px。**
任选一个 28px 圆角的容器（表格框、详情的属性块），量内边距。
**小于 24px 即不通过** —— 半径 28 的角会切到内容。（FR-003）

**4. 表格行高 48px。**
资产列表随便量一行 `<td>` 的高度 —— 48px（来自 14px 上下内边距 + 20px 行盒）。
表头 `<th>` 的字重 600、色 `--secondary-foreground`。
**行高回到 45px 即不通过**（那是改造前的读数）。

**带控件的格必须是 `py-0`**：勾选框、状态芯片、行尾按钮那三格。
它们若带着 28px 内边距，有芯片的行就会比没芯片的行高一截 ——
参照稿不会遇到这件事，因为它的芯片是普通 inline `<span>`，
行内盒的纵向内边距根本不进行盒。（FR-004 / SC-001）

**5. 三档地面各归各位。**
控制台跑一遍：
```js
[...document.querySelectorAll('*')]
  .filter(e => getComputedStyle(e).backgroundColor === 'rgb(235, 221, 197)')
  .map(e => e.className)
```
`#ebddc5` 是 `--card`。**每一处命中都必须是真正浮起的东西** ——
对话框、抽屉、悬浮卡、底部批量条。

源码那一半在提交前就能查，不用等跑起来：

```sh
grep -rn "bg-card\|<Card" web/src --include='*.tsx'
```

**命中集合必须等于这份白名单，多一处就是判错了一处**：

| 允许 | 为什么 |
|---|---|
| `features/assets/ActionBar.tsx` | `sticky bottom-4`，行从它下面滚过去 —— 它真的浮着 |
| `components/ui/card.tsx` | 「浮起」这个原语本身 |
| `components/ui/dialog.tsx` | 对话框真的浮在页面之上 —— 这一处是 018 **加上**去的 |
| `routes/Login.tsx` | 登录页右侧那个 300px 装饰圆 —— 用的是 `--card` 这个**颜色**，不是卡片这个**形制** |

`routes/AppShell.tsx` 已于第 7 阶段移出名单：侧栏改成圆角 `--well` 块，不再用 `--card`。

`ui/alert.tsx` 曾经在这份名单上，2026-09-08 由开发者裁定移出 ——
提示块不浮起，改坐 `--well`、圆角 20px。
表格框、状态卡、页面分区出现在结果里即不通过。（FR-007 / FR-010 / SC-002）

**6. 中文标题有层级。**
打开任意中文页面，量 h1 —— 40px/1.2/700。区标题 21px/700。正文 16px。
**三级在不看颜色时能一眼分出。**
再确认 `PageHeader` 的 h1 **不再有** `font-heading`（Caprasimo 渲染不出中文，
挂着等于没挂）。（FR-011 / FR-012 / SC-003）

**7. Caprasimo 只在它管得住的地方。**
产品名（侧栏、登录页）、资产详情的 h1（资产编号）、各处计数、字段键名、
页码 —— 这些是 Caprasimo。**中文标题不是。**
资产详情的 h1 **应当**是 Caprasimo，漏了就白改。（FR-011）

**8. 焦点环。**
从页面顶部按 Tab 走到底。每个可交互元素的焦点是
`outline: 2px solid` + `2px` 偏移，**不是** 3px 实心 ring。
调研实测四种底色 5.09–6.22:1；这一步只确认它**换过来了**且到处可见。
**留下浏览器默认蓝环即不通过。**（FR-017 / SC-004 / SC-008）

**9. 017 的选择模型一件不少。**
资产页筛出 40 台以上：点表头勾选框 → 本页全选 + 横幅出现；
点「选中符合当前筛选的全部 N 条」→ 批量条显示总数；
勾第 3 行、Shift 点第 9 行 → 3–9 全选；
鼠标移到一行 → 行尾三个按钮出现，点「打印标签」直接对这一台生效且不进详情；
一台不选 → 底部没有批量条。
**七项少一项即不通过。**（FR-019 / SC-005）

**10. 八个元数据页是一次改出来的。**
字段、字段组、型号、厂商、状态、持有方、账号、角色 —— 逐个打开，
行高、分区间距、表头形态**完全一致**。
任选一页做一次点击行编辑、一次右键操作、一次会被拒绝的操作 →
**拒绝显示在对话框内部。**（FR-024 / FR-029）

**11. 概览页。**
五个状态区块横向排列，每个 ≥152px，上芯片下大计数（Caprasimo）；
计数为 0 时数字退到次要色，**但区块仍然可点**。
类别分布每行是「名 + 药丸轨道 + 右对齐计数」，**整行可点**并跳到筛选结果。
最近流转每行左侧一个鼠尾草圆点。（FR-015 / US5）

**12. 资产详情。**
h1 是资产编号本身（Caprasimo、等宽数字）+ 状态芯片。
属性四列网格，整块坐在 `--well` 上，圆角 28、内边距 ≥24。
窄屏降两列。（US6）

**13. 登录页。**
左列表单（≤420px）、右列柔形、之间 64px、垂直居中。
产品名 Caprasimo 52px 两行。
**左列不再是一块 `--card` 面板** —— 两列直接坐在地面上。
右侧柔形 `aria-hidden`，**不含任何状态色**。
**底部不再有域名限制说明** —— 2026-09-08 开发者裁定拆掉，按稿子的 SignIn 来。
（US7 / FR-030）

**14. 打印对话框。**
勾选几台设备 → 打印标签。对话框 ≤620px、`--card` 底（**这一处用卡片是对的**）、
圆角 28、内边距 32。提示块 `--well` 底、圆角 20。
作业进度轨是鼠尾草（它数张数不数状态）；只有「失败」那行用状态红。（US8）

**15. 三个没画的页面跟上。**
导入、审计、全量历史 —— 与相邻页面对比行高、分区间距、内容列宽度、地面分工。
**一眼看得出是补丁即不通过。**
审计的前后值新旧仍可分，且**把浏览器调成灰度后仍可分**。（US9 / FR-025）

**16. 类别页的两条老规矩没被版面改动碰坏。**
不搜索是缩进的树；搜索切平铺显示完整路径；清空恢复成树。
**名称格里仍然没有行内箭头**（它会连同行点击一起触发）。（FR-023）

**17. 地址栏。**
筛几个条件、翻到第 3 页，点进一台设备再返回 → 筛选与页码都在。
按浏览器后退 → 回到刚才那台设备，**不是**把搜索框的每次击键倒一遍。（FR-022）

**18. 英文界面。**
切到英文，重走第 1、4、10 步。
**药丸内没有换行、48px 行高没被英文撑破、固定列宽没把内容挤没。**（SC-007）

**19. 服务端一行没改。**
`git diff main --stat -- internal/ cmd/ migrations/` → **空**。
`go test ./...` 全过。`nexus verify` 通过。
**这一步应当无事发生 —— 有事发生就说明这一轮越界了。**（SC-009）
