<!-- SPECKIT START -->
当前计划：`specs/011-expression-engine/spec.md`

开工前必读，按优先级：

1. `.specify/memory/constitution.md`（v1.1.0）—— 五项不可协商原则与七条合并门禁
2. `specs/011-expression-engine/` —— 本轮特性的规格与检查清单；
   调研与备选方案在 `docs/research-expr-engine.md`
3. `docs/design-baseline-v5.md`（决策 61–63）—— 状态不再约束持有方。
   **冲突时以最新一版为准：011 > 010 > 009 > 008 > 007 > v5 > 006 > 005 的 research.md > v4 > v3 > v2 > v1**
4. `docs/design-baseline-v4.md`（决策 53–60）—— 状态成为可配置的数据
5. `docs/design-baseline-v3.md`（决策 41–52）—— 字段可删除、型号多对多
6. `docs/design-baseline-v2.md`（决策 25–40）—— 编号模型、依赖门禁、流转
7. `docs/design-baseline.md` —— 原始设计基线（决策 1–24）
8. `specs/001-asset-ledger-demo/` ~ `specs/010-asset-row-gestures/` —— 前十轮特性。
   001 的 `contracts/openapi.yaml` 仍是**全量**端点清单

**最容易违反的十条硬规则**

- **组件必须来自 shadcn/ui。** 不存在时必须先与开发者确认才能自定义，**不接受事后补批**。
  类别树用 `Collapsible` 递归组合，不引入树组件。
  **下拉一律用 `Select`，不写原生 `<select>`**；表单布局用 `Field`/`FieldGroup`/`FieldSet`，
  不用 `div + Label`；提示用 `Alert`、空状态用 `Empty`、加载用 `Skeleton`/`Spinner`。
  `Select` 是 Radix 组件不是原生控件，测试要用 `src/test/choose.ts` 的助手而非
  `user.selectOptions`；`SelectItem` 不接受空字符串值，「未选/全部」走 `lib/select.ts` 的哨兵。
- **前端测试必须含 DOM 测试**（Vitest + React Testing Library，断言 `getByRole` 与
  `userEvent`）。只测纯函数或只做快照比对不算数。触及 UI 的 PR 必须新增或更新 DOM 测试。
- **文档中文、代码英文；用户可见文案走目录，且必须两种语言都有。**
  前端 `web/src/i18n/{zh,en}.ts`（`en.ts` 由 `typeof zh` 约束，漏一条是编译错误），
  服务端 `internal/i18n/catalog.go`（漏一条由 `TestCatalogsCoverTheSameKeys` 抓）。
  **领域层不自己拼文案** —— 返回 `i18n.M(key, args...)` 或 `i18n.Wrap(sentinel, key, ...)`，
  由 HTTP 边界按 `Accept-Language` 渲染一次。两种语言的**参数个数与顺序必须一致**。
  标识符、日志、`error.code`、`error.fields` 的**键**、CSV 模板的键名行**都不翻译**。
- **前端字典是模块级 live binding（`export let t`）。** 在模块**加载时**求值的东西
  会冻结在首次加载的语言里，而 typecheck 看不见。导航数组、`transferActions`
  已经改成函数；下次再写 `const x = [{ label: t.… }]` 之前先想一遍。
- **SQLite 写事务一律 `BEGIN IMMEDIATE`，写连接池为 1。** 唯一性现在由
  `asset_unique_values` 上的部分唯一索引保证（v2 决策 32），所以这条不再是正确性前提，
  但保持不变 —— 放宽没有收益。
- **`assets` 没有 `sn` 列。** UUID 是唯一内部标识；人能读的编号是某个标为唯一的字段，
  由类别的 `display_key` 指定，未指定时回退 UUID 前 8 位。改动编号相关代码前先读 v2 文档。
- **状态是数据，不是常量。** 标签、颜色与三项行为都在 `statuses` 表里。
  标签**不在** `zh.status`（已撤销）—— 前端一律走 `useStatuses()`，
  服务端一律走 `model.StatusSet`。写事务里的判定必须从 `tx` 读状态集，不从连接池读。
  转换规则**内置对内置沿用原 5×5 矩阵**，涉及自定义才放行，这是为了不放松任何既有护栏。
  状态只剩两个行为开关（`counts_as_available`、`terminal`），且对内置锁死。
  **状态不再约束持有方的种类**（007 移除了 `requires_location`）—— 在库可以由公司、
  部门或某个人持有。唯一还要求「必须是位置」的是**默认库存点**，那是另一条规则：
  归还需要指向一个具体的地方。
- **持有方是一棵有规则的树，且可编辑可删除。** 部门必须属于公司，位置可挂公司或部门、
  也可不挂，公司无上级。规则写在 `internal/holder` 的 `allowedParents` 表里，
  前端有同形一份（`web/src/lib/types.ts`）**只用于不提供非法选项**，把关的仍然是服务端。
  移动要防成环。迁移**不回填**存量的无上级部门。
  **持有方没有「停用」**（006 起）：删除在有设备、有下级、是默认库存点时拒绝；
  仅在流转历史中出现只提示不拒绝 —— 与状态删除同一条规则。类型不可改。
- **归还的目的地在设备身上，不在系统身上。** `assets.home_holder_*` / `home_owner_id`
  是设备「不在外面时归属何处」。归还的解析在 `applyOne` **逐台**进行：
  请求指定 → 该资产的 home → 全局默认库存点 → 报错。
  解析绝不能挪回批次层面 —— 那会让一批来自四个仓库的设备仍然只去一个地方。
  三态：字段缺席 = 不动，显式 null = 清空，有值 = 设置。
- **元数据表格：点击行编辑，右键出操作菜单。** 不留成列的操作按钮。
  不适用的菜单项**禁用而不是隐藏**。破坏性操作要 `confirm` 并输入该行标识。
  约定集中在 `CrudPage` 的 `onRowClick` / `rowActions`，不要在页面里各写一遍。
  **资产表格是手写的**（勾选、分页、动态列），不走 `CrudPage` —— 改这条约定时
  要记得它也要跟上；007 定规范时就漏了它一次。
  **翻页只有一份实现**：`features/common/Pager.tsx`（区间行、每页条数、页码），
  且**放在表格下方**——读完一页才需要它。资产表与审计表都用它，不要再抄一份。
  **筛选是一栏**：控件横排一行，标签 `sr-only`，「全部 X」写在控件自己的值里，
  不要在控件上方再堆一层文字。
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
  **类别页有意不套用** —— 它是树不是列表。
  右键菜单在触发时关闭，所以确认框必须渲染在菜单之外（`ConfirmDialog` 有受控模式）。
  **元数据的编辑器一律是 `Dialog`**，不是内联展开的 `Card` —— 那会把整张表推下去。
  **单元格里不放可点击控件** —— 它会连同所在行的点击一起触发，一次点击出两个结果。
  改这一行的任何东西都在编辑对话框里，包括「设为默认库存点」这类一次性动作。
  **对话框里发生的拒绝要显示在对话框里** —— 它背后的页面是 `aria-hidden` 且被遮住的。
- **重的库要 `lazy` 到自己的 chunk 里。** `recharts` 走 `features/overview/CategoryChart.tsx`
  + `Suspense`：入口 chunk 与概览页 chunk 都不含它（否则概览页 chunk 是 358KB 而非 4.4KB）。
  测试环境的 `ResizeObserver` 桩会回报固定尺寸，否则图表在 jsdom 里根本不渲染，
  断言会因为与图表无关的原因通过。
- **术语：「字段」。** 009 起统一叫「字段」；001–008 的规格与设计基线里写的是
  **「信息项」，指同一样东西** —— 读历史文档时按此对应，不要以为是两个概念。
  代码里一直是 `field`，没有改过。
- **表达式引擎是 expr-lang/expr，不是 `text/template`**（011 起）。
  `hex2dec(attrs.mac)`、`attrs.mac | hex2dec() | pad(16)`、`a == b ? x : y`、`??` 都可用。
  **管道把左值传成第一个参数**，与旧引擎相反 —— 自定义函数的签名都是「主语在前」。
  `internal/compute/translate.go` 保留着旧语法的转换器，供从旧备份恢复的人使用。
- **`internal/compute` 的 AST 护栏不是加固，是前提。** 旧语法的贫乏白送了三样东西，
  新语法把它们拿走了：非常量下标（会让「读了哪些字段」无法回答）、遍历构造、
  未定义的名字（会静默变成空值拼进编号）。三者都在 `parse.go` 的 `guard` 里拒绝。
  **动这个文件前先读 `docs/research-expr-engine.md`。**
- **面向用户的错误一律走 `userText(c, err)`，不要用 `err.Error()`。**
  后者取的是默认语言，英文请求会收到中文。006 在七处漏过这一点，011 补齐。
- **字段没有「停用」。** 只有删除（无关联时）与解绑（有存量数据时）。
  `archived_attrs` 是**解绑**产生的孤儿键，与停用无关，不要跟着一起清理掉 ——
  删掉它会让「解绑后仍能查看旧值」当场失效，且没有任何现有测试会失败。
<!-- SPECKIT END -->
