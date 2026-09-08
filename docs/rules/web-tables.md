# 表格页、列表与页面骨架

改 `web/src` 之前读这一份，以及同目录的 `web-forms.md`。
「列表有两种形状」那条服务端也要遵守，所以 `internal/httpapi` 也指着它。

- **元数据表格：点击行编辑，右键出操作菜单。** 不留成列的操作按钮。
  不适用的菜单项**禁用而不是隐藏**。破坏性操作要 `confirm` 并输入该行标识，
  **待输入的标识要能一键复制**（`ConfirmDialog` 里的 `code` + 复制按钮）——
  手抄一串编号只会抄错，抄错并不会让删除更安全。
  **复制一律走 `lib/clipboard.ts` 的 `copyText`，不要直接调 `navigator.clipboard`** ——
  它只在安全上下文里存在，而这套系统是 `http://内网地址:8080` 跑的，
  那里 `navigator.clipboard` 是 `undefined`，裸调加 try/catch 的结果就是按钮毫无反应。
  降级路径是选中该节点的文本再 `execCommand("copy")`（选中而不是隐藏 textarea，
  因为对话框会抢焦点）；两条路都失败就明说「已选中，按 Ctrl+C」，不要静默。
  约定集中在 `CrudPage` 的 `onRowClick` / `rowActions`，不要在页面里各写一遍。

- **资产表格是手写的**（勾选、分页、动态列），不走 `CrudPage` —— 改这条约定时
  要记得它也要跟上；007 定规范时就漏了它一次。
  **显示列是筛选行右端的三点 `DropdownMenu`**（`DropdownMenuCheckboxItem`），
  不是一整块复选框。**选择按类别分别记忆**（`nexus.assetColumns` 是
  `{类别id: 键[]}`，不再是一个扁平数组），渲染前还要再与当前类别的
  `available` 求交 —— 否则字段被解绑、或类别刚切换 schema 还没到，
  就会画出一列有表头没内容的空列（表头还退化成英文键名）。
  **设备字段的列由型号筛选或厂商筛选解锁**（016 起后者也算）：绑到厂商的字段，
  到达集是该厂商旗下全部型号，只按「筛到某一款型号」判会让它永远选不中 ——
  而筛了厂商之后屏幕上剩下的本来就全是它的设备，正是这条规则说的那个条件。菜单要 `modal={false}` 且 `onSelect` 里 `preventDefault()`：
  勾一列就是为了看它出现，模态菜单会把表格设成 `aria-hidden`（测试也因此找不到表头），
  而每勾一次就关一次会让选四列跑四趟。
  **翻页只有一份实现**：`features/common/Pager.tsx`（区间行、每页条数、页码），
  **一整行**（左区间、中页码、右每页条数），且**放在表格下方**——读完一页才需要它。
  资产表与审计表都用它，不要再抄一份。
  `PaginationPrevious`/`PaginationNext` 的可见文字上游是写死的 "Previous"/"Next"，
  已改成可由 children 覆盖 —— 那两个词是全站唯一没走目录的文案，
  而 `aria-label` 是我们自己传的，所以按名字找元素的测试一直是绿的。
  **筛选是一栏**：控件横排一行，标签 `sr-only`，「全部 X」写在控件自己的值里，
  不要在控件上方再堆一层文字。
  **筛选与翻页都写进地址栏**（`setSearchParams(..., { replace: true })`）——
  否则点进一台设备再返回，筛选全没了，人要重新缩一遍。用 **replace 不用 push**：
  筛选不是一个「去过的地方」，push 会让「后退」把搜索框的每一次击键都倒一遍，
  而不是回到刚才那台设备。资产、审计、字段三页都照此办理；
  比较的是 `useSearchParams()` 的值，不要读 `window.location`。
  **日期用 `Popover` + `Calendar`**（`mode="range"`），不写 `<input type="date">`；
  语言跟 `getLang()` 走 `react-day-picker/locale` 的 `zhCN`/`enUS`。
  测试里选日期按 `data-day="YYYY-MM-DD"` 定位，别按按钮名 —— 那是整句本地化日期。
  （`DynamicForm` 的 date 字段仍是原生 input，尚未跟上。）
  审计表遵守同一套点击/右键约定，但**审计条目不可编辑也不可删除**（它就是记录），
  所以行点击是**弹 `Dialog` 看前后值**，右键菜单是「查看变更内容」与
  「只看这个对象/类型/操作人」这类收窄筛选。表里**不留「变更内容」这一列** ——
  一列只写「查看变更内容/没有前后值」是噪音，可点与否由光标和禁用的菜单项表达。
  前后值不要就地展开在表格下方 —— 那块内容会落在翻页条以下，用户点了看不见任何反应。
  收窄是看不见的，所以筛出来的条件要以 `Badge` 显示并可一键清除。
  **类别页也套用了**（原来「有意不套用」的例外已撤销）：树以缩进 + 深度优先顺序
  放进表格，**点击行弹 `CategoryEditor` 对话框**（名称、上级、编号字段一次保存，
  字段绑定表在同一个对话框里，删除也在里面），右键出「编辑 / 新建子类别 / 展开折叠」。
  折叠放在菜单里而不是名称单元格里的小箭头 —— 那是「单元格里放可点击控件」。
  `CollapsibleTree` 已随之删除；再要树形展示先想清楚为什么表格不够。
  右键菜单在触发时关闭，所以确认框必须渲染在菜单之外（`ConfirmDialog` 有受控模式）。
  **元数据的编辑器一律是 `Dialog`**，不是内联展开的 `Card` —— 那会把整张表推下去。
  **单元格里不放可点击控件** —— 它会连同所在行的点击一起触发，一次点击出两个结果。
  改这一行的任何东西都在编辑对话框里，包括「设为默认库存点」这类一次性动作。
  **对话框里发生的拒绝要显示在对话框里** —— 它背后的页面是 `aria-hidden` 且被遮住的。

- **表格页的零件只有一套**（014 决策 90/92/95）。搜索、筛选、翻页、地址栏同步
  分别是 `features/common/` 的 `ListToolbar`、`useListQuery`、`Pager`；
  六个元数据页由 `CrudPage` 自动获得，资产、审计、类别各有各的手写表格但用同样的零件。
  **不要把手写的三个塞进 `CrudPage`** —— 它会长出「没有新建按钮」「勾选列」「树」
  三个特例开关。筛选值以 API 的键命名（`category_id`、`type`、`status`），
  一份对象同时喂给地址栏和请求；空串 = 不筛，两边都不出现。
  **筛选控件的 id 不能和新建表单里的同名控件撞**（`f-type` vs `f-type-filter`）——
  对话框一开，背后那个变成 `aria-hidden`，`getByLabelText` 就找不到表单里的那个了。

- **列表有两种形状，按问题决定**（014 决策 92）。`/categories`、`/models`、
  `/statuses`、`/holders`、`/users` 带了 `q`/`offset`/`limit` 返回
  `{items,total,offset,limit}`，一个都不带返回**数组**。这是**加**行为不是改行为：
  下拉框要的是全集，分页会把选项截断；而 zenith-printer 的数据源按数组解析
  `/api/categories`，改形状会让对面刷新数据源当场报错。服务端一律走
  `internal/httpapi/listing.go` 的 `respondList` / `matches` / `keep`。
  `/roles` 例外，它从来就是信封（要带 `permissions`）。

- **资产详情是盖在列表上的 dialog，但仍然是一个地址**（014 决策 89）。
  `/assets/:id` 是 `assets` 的**子路由**，`Assets.tsx` 里有 `<Outlet />`。
  保留地址是因为扫码枪精确命中时 `navigate('/assets/<id>')`、录入完成跳新设备、
  审计「只看这个对象」都指着它。dialog 里只放**最近 5 条**流转，
  **全量历史在 `/assets/:id/history`**（另一条顶层路由，整页）。
  关闭时 `navigate({pathname:"/assets", search})` —— 带上 search，
  否则关掉 dialog 就把列表的筛选一起关掉了。

- **类别页不翻页，一搜索就从树切成平铺**（014 决策 91）。树上放分页会让第 2 页
  开头的子类别失去它在第 1 页的父，缩进就成了没有出处的悬空；搜索同理，
  所以命中行改显示完整路径「网络设备 / SDWAN 路由器」。清空搜索恢复成树。

- **账号能改的东西在行点击弹出的编辑对话框里**（014 决策 93/94）。
  邮箱只读、姓名可改、角色可改（013 的两条守卫不变），
  **停用与启用成对** —— `PATCH /users/:id` 的 `{"disable": false}` 以前被读了
  但被忽略，误停一个同事只能去改数据库。**重置密码仅本地账号**，
  OIDC 账号禁用并说明；破坏性操作走 `ConfirmDialog` 并要求输入该账号邮箱。

- **页面骨架有三个共用件**：`features/common/` 的 `PageHeader`（标题 + 一句说明 +
  右端动作）、`TableFrame`（`overflow-x-auto rounded-md border`）、
  以及 014 的 `ListToolbar` / `useListQuery` / `Pager`。**页面容器一律 `grid gap-6`**，
  不要再各写各的 `ml-auto` 与 `gap-5`。卡片用全套组合：标题下的那句话是
  `CardDescription`，右上角的控件是 `CardAction`，都不要用 `<p>` 或 `ml-auto` 手搭；
  表单容器是 `FieldGroup`（栅格写成 `className="sm:grid sm:grid-cols-2"`），
  空状态是 `Empty`，提示是 `Alert`。`Field` 默认占满宽度 ——
  要窄的控件把宽度写在 `Field` 上，写在 `SelectTrigger` 上不生效。

## 版面数字（018）

**这些数字不是风格偏好，是量出来的，改之前先读完这一节。**

| | | 为什么 |
|---|---|---|
| 表格行高 | **48px** | 来自 `TableCell` 的 `py-[14px]` + 20px 行盒，**不是** `TableRow` 上的 `h-12` |
| 单元格内边距 | `px-5 py-[14px]` | 表头同款；表头字重 600、色 `--secondary-foreground` |
| 分区之间 | **56px**（`gap-14`） | 页标题与内容之间也是这个 |
| 区内成组 | **22px**（`gap-[22px]`） | 搜索条 / 表格 / 翻页条是**一组**，不是三个分区 |
| 内容列 | **≤960px 贴左** | 在 `AppShell` 的 `<main>` 里一次设定；正文类 760、表单 620–640 |
| 圆角 | **28 / 20 / 999** 三档 | 容器 / 下沉块与提示块 / 小控件。例外两处，见 `index.css` 注释 |
| 输入与选择 | **48px**（登录 50px） | 按钮**不按高度规定**，按 `py-3`（≈44px） |

### 带控件的单元格必须 `py-0`

`TableCell` 里已经写了 `[&:has(button)]:py-0`、`[&:has([data-slot=badge])]:py-0`。
**不要拿掉。** 一个 22px 的状态芯片或 32px 的行尾按钮组，加上 28px 内边距，
会让有芯片的行比没芯片的行高一截 —— 一列里两种行高。

参照稿不会遇到这件事，因为**它的芯片是普通 inline `<span>`**，
而行内盒的纵向内边距根本不进入行盒。我们的 `Badge` 是 `inline-flex`，
是一个原子行内块，它的高度会顶进行盒里。这是这一轮花时间最长的一处，记在这里。

### 中文标题不要挂 `font-heading`

Caprasimo **只有 latin 子集**。挂在「资产」两个字上，什么也不会发生 ——
017 曾经为它「没有粗体」写过一整段推理，而前提是错的：那两个字从来没被它渲染过。

中文层级靠字号字重：页标题 `text-[40px]/1.2 font-bold`，区标题 `text-[21px] font-bold`。
**反过来也成立**：资产编号、计数、页码、流程序号是拉丁与数字，**应当**加 `font-heading`。
`PageHeader` 的 `title` 收 `ReactNode`，所以标题本身是拉丁的页面自己传进来。

### 焦点环是 outline，不是 ring

`index.css` 的 `:focus-visible` 一条管全站：`outline: 2px solid var(--ring); outline-offset: 2px`。
**不要在组件上再写 `focus-visible:ring-*`，更不要写 `outline-none`** ——
后者会把全局规则关掉，而它偏偏出现在最需要焦点环的那些控件上。

唯一的例外是 `InputGroup`：环画在药丸本身，内层 `input` 用 `focus-visible:outline-none` 让位，
否则 outline 会在圆角组里横着画一个矩形。

四种底色实测 5.09–6.22:1（WCAG 1.4.11 要 3:1）。017 那版失败在**半透明**（1.69），
不在机制 —— 换机制时重量过一遍，数字记在 `specs/018-organic-layout/research.md` 第五节。
