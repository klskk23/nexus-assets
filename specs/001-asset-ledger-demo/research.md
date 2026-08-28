# Phase 0 研究：实现级决策

**Feature**: 001-asset-ledger-demo | **Date**: 2026-08-28

Technical Context 中没有 NEEDS CLARIFICATION —— 技术选型已由章程 v1.0.1 与
`docs/design-baseline.md` 全部锁定。本文解决的是选型之下、实现之上的一层：
**已定决策落地时必须先想清楚、否则会在编码中途卡住或被静默做错的地方。**

每条决策标注了是否需要在 Setup 阶段用一条可执行的断言验证。凭记忆写下的库用法不算数。

---

## D1. SQLite pragma 的设置方式与生效验证

**Decision**: 通过 DSN 查询参数设置，形如
`file:nexus.db?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)`。
**并在 `store.Open()` 中回读断言**：连接建立后立即执行 `PRAGMA journal_mode;` 与
`PRAGMA busy_timeout;`，值不符合预期则直接返回错误、拒绝启动。

**Rationale**: 驱动实测（modernc.org/sqlite v1.57.0）：该版本**同时接受**两种语法，
`_pragma=journal_mode(WAL)` 与 mattn 风格的 `_journal_mode=WAL` 都会生效。
因此「换错语法会静默失效」这一说法对本版本不成立 —— 规划阶段的这条判断已被运行时验证推翻。

**但回读断言仍然必需**，防的是另一件事：不带任何 pragma 参数的连接串会**静默**得到
`journal_mode=delete`、`busy_timeout=0`、`foreign_keys=0`，开库不报任何错。
参数写漏一个、拼错一个值，结果都一样是静默降级。

这是本项目最容易被静默做错的一处配置，因此不接受"写了就行"，必须回读验证。

**Alternatives considered**:
- 连接后执行 `db.Exec("PRAGMA journal_mode=WAL")` —— 对连接池不可靠：池中每条新连接都需要
  重新设置，而 `database/sql` 何时新建连接不受控制。DSN 参数会应用到每条连接，是正确层次。
- 信任文档不做回读 —— 正是上面要避免的失败模式。

**验证**: 已完成。`internal/store/pragma_test.go` 覆盖四种降级路径（无参数、拼错值、漏 busy_timeout、漏 foreign_keys），全部被断言拦下。

---

## D2. `BEGIN IMMEDIATE` 在 database/sql 上的表达

**Decision**: 在写连接池的 DSN 上追加 `_txlock=immediate`，使 `db.BeginTx()` 开出的事务
默认取排他锁。**同样需要回读验证**：开一个事务、在另一条连接上尝试立即写入，断言第二条
遭遇 busy 而非成功。若该参数在驱动上不被支持，退回方案是从池中 `db.Conn()` 取出单条连接、
手工 `ExecContext("BEGIN IMMEDIATE")` 并自行管理提交回滚。

**Rationale**: `database/sql` 的 `BeginTx` 没有表达 SQLite 事务锁级别的入口，只能靠驱动。
而 `BEGIN IMMEDIATE` 不是可选优化 —— 章程「技术栈约束」明确写它是**应用层唯一性校验成立的
前提**。默认的 `BEGIN DEFERRED` 下，两个事务可以先后读到「无冲突」，随后一个升级为写、
另一个才拿到 busy；虽然第二个最终会失败，但失败点从"校验时给出清晰的字段级错误"退化成
"提交时的 busy 错误"，用户看到的是一个无法理解的提示。

**Alternatives considered**:
- 依赖数据库级唯一索引 —— 唯一字段是运行时可配的，落到索引意味着动态 DDL，
  设计基线第 4 项决策已明确排除。
- 用应用层互斥锁串行化写入 —— 单实例下可行，但把正确性依赖从数据库挪到了进程内存，
  且与"写连接池为 1"重复。

**验证**: 已完成。`internal/store/txlock_test.go` 实测通过 —— 第二个 `BEGIN` 返回
`database is locked (5) (SQLITE_BUSY)`，证明 `_txlock=immediate` 被 modernc v1.57.0 正确支持，
**退回手工 BEGIN 的备选方案用不上**。

---

## D3. 读写连接池分离

**Decision**: 对同一个数据库文件开两个 `*sql.DB`：
- 写池 `SetMaxOpenConns(1)`，DSN 带 `_txlock=immediate`
- 读池不限并发，DSN 不带 `_txlock`

`store` 包对外只暴露 `Read()` 与 `Write(fn func(tx *sql.Tx) error)` 两个入口，
调用方拿不到裸的 `*sql.DB`，避免有人在读池上写。

**Rationale**: 章程要求写连接池为 1。若只开一个池，读也被串行化 —— 列表页每次请求要发
若干条查询，十人同时用就会排队，原则 IV 的 p95 < 200ms 无从谈起。WAL 模式的意义正是
读写互不阻塞，两个池才能用上它。

**Alternatives considered**:
- 单池 `SetMaxOpenConns(1)` —— 最简单，但放弃 WAL 的并发读，性能目标不可达。
- 单池放开并发、靠 `BEGIN IMMEDIATE` 串行写 —— 也能工作，但违反章程明文的"写连接池设为 1"。
  章程要改可以，但不该在实现阶段悄悄绕过。

**验证**: 已完成。`internal/store/concurrency_test.go` 实测通过 —— 写事务未提交时读照常返回。

---

## D4. 迁移的组织与执行

**Decision**: `migrations/*.sql` 用 goose 的注释语法（`-- +goose Up` / `-- +goose Down`），
经 `embed.FS` 打包，程序启动时自动执行到最新版本。首版只有 `001_init.sql`。
`json_extract` 表达式索引与带 `WHERE` 的部分唯一索引都写在迁移 SQL 里，不用 ORM 生成。

**Rationale**: 章程已指定 goose。手写 SQL 而非从 struct 推导，是因为本项目的索引里有两类
ORM 表达不了的东西：`assets(json_extract(attrs,'$.mac'))` 表达式索引，以及
`holder_entities(is_default_stock) WHERE is_default_stock = 1` 部分唯一索引。

**Alternatives considered**: 章程「技术栈约束」已锁定 goose，本条不重新论证。

**验证**: 不需要专门验证；集成测试每次建库都会跑一遍迁移。

---

## D5. Google OIDC 的域名准入校验点

**Decision**: 校验三项，全部通过才放行：
1. ID token 由 Google 签发且签名有效（交给 `go-oidc` 的 verifier）
2. `email_verified` 为 true
3. 域名匹配 —— 默认比对 `hd`（hosted domain）声明；由配置项 `OIDC_REQUIRE_HD` 控制，
   置 false 时退回比对 `email` 的域名后缀

**Rationale**: `hd` 声明只有 Google Workspace 账号才有，且由 Google 保证其对应的域名确实
归该组织所有。仅比对 email 后缀较弱：个人 Google 账号可以用任意已验证的邮箱地址注册，
理论上存在用本域邮箱注册个人账号的路径。默认走 `hd` 是更强的准入。
但如果公司用的不是 Workspace，`hd` 根本不存在，一律拒绝会导致谁都登不进去 ——
所以给一个显式的配置开关，而不是在代码里二选一。

**Alternatives considered**:
- 只比对 email 后缀 —— 更简单，准入强度弱一档。作为配置项保留。
- 邀请制（预先登记邮箱） —— 与 FR-002「域内邮箱首次登录自动建号」直接冲突，已排除。

**验证**: 需要。集成测试用构造的 ID token claims 覆盖三条分支：`hd` 匹配、`hd` 缺失、
`hd` 不匹配。

---

## D6. 模板能力限制与引用抽取

**Decision**: 模板经 `text/template` 解析后，遍历 `tmpl.Tree.Root` 的语法树：
- 遇到 `*parse.IfNode`、`*parse.RangeNode`、`*parse.WithNode` 一律拒绝，
  错误信息指明模板中不允许分支与循环
- 从 `*parse.FieldNode` 抽出被引用的路径（`.attrs.mac`、`.category.code` 等），
  作为该计算项的依赖集合，用于建 DAG 与反向依赖检查

FuncMap 白名单：`hex2dec` `dec2hex` `pad` `trunc` `slice` `upper` `lower` `trim`
`replace` `default` `printf`。白名单之外的函数名在解析阶段即报未定义。

**Rationale**: 依赖抽取必须走语法树而非正则 —— 正则会在管道、嵌套调用、字符串字面量里出错，
而依赖集合直接决定环检测与 FR-031「被引用的信息项不得停用」的正确性，抽错了就会漏拦。
拒绝 `if`/`range` 是设计基线的明确决定：标识符生成规则里出现分支逻辑是复杂度失控的信号。

**Alternatives considered**:
- 正则抽取 `{{ ... }}` 内的标识符 —— 快，但在 `{{ printf "%s" (.attrs.a | pad 4) }}`
  这类嵌套下不可靠。
- 换 `expr-lang/expr` —— 设计基线第 7 项决策已选定 `text/template`，不重新论证。

**验证**: 必需，属章程原则 II 点名的核心管线之一。测试须覆盖：嵌套管道的依赖抽取、
含 `if` 的模板被拒、白名单外函数被拒、三节点以上的环被检出。

---

## D7. 类别树与持有方树的组件方案

**Decision**: 用 shadcn/ui 的 `Collapsible` 递归组合实现，节点行由 `Button`（ghost 变体）
承载，缩进用 Tailwind 的 padding 阶梯。**不引入自定义树组件。**

**Rationale**: shadcn/ui 没有专用的 Tree 组件 —— 这是本项目与章程原则 III 唯一的正面接触点。
但原则 III 要求确认的前提是"所需组件在 shadcn/ui 中不存在"，而树是一种**组合形态**
而非原子组件，用 `Collapsible` 递归可以完整表达展开/收起、层级缩进与选中态。
因此这属于"使用现有组件"，不触发确认流程。

**风险与红线**: 若实现中发现该方案在深层类别树下可用性不可接受（例如缩进层级过多、
键盘导航缺失），**必须暂停并与开发者确认后**才能引入自定义树组件或第三方树库。
不得先做后报 —— 章程原则 III 明写"不接受事后补批"。

**Alternatives considered**:
- 第三方树库（react-arborist 等） —— 触发自定义组件确认流程，且引入新依赖。
- 扁平化展示 + 面包屑 —— 回避了树，但类别继承关系正是用户需要看清的东西，
  扁平化会让"这个信息项从哪一级继承来"变得不可见（Edge Case 已点名此问题）。

**验证**: DOM 测试覆盖三层嵌套的展开、收起与选中。

---

## D8. 前端 DOM 测试中的 TanStack Query 封装

**Decision**: 提供 `web/src/test/renderWithProviders.tsx`，每个测试创建**全新的**
`QueryClient`，配置 `retry: false`、`gcTime: 0`，并包裹 `QueryClientProvider` 与
`MemoryRouter`。网络层用 `vi.fn()` 替换 API 客户端模块，不做真实请求。
断言一律走 `getByRole` / `findByRole` + `userEvent`，禁止快照测试。

**Rationale**: `retry: false` 是关键 —— 默认重试会让"断言错误态出现"的测试等满重试次数
才失败，表现为随机超时。每个测试独立的 client 则避免用例间缓存串味（章程原则 II
禁止测试依赖执行顺序）。用 role 查询而非 testid 是为了让 DOM 测试真正验证可访问性
（原则 III 要求交互元素键盘可达）。

**Alternatives considered**:
- MSW 拦截网络层 —— 更接近真实，但对本项目是过度工程：契约由后端集成测试保证，
  前端只需验证渲染与交互。
- 共享一个 QueryClient —— 会引入顺序依赖，章程明文禁止。

**验证**: 不需要专门验证；它本身是测试基础设施。

---

## D9. 概览页的可视化方案

**Decision**: 类别分布用 `Progress` 条 + 列表呈现，**不使用 shadcn/ui 的 Chart 组件**。
状态卡片用 `Card`，最近流转用 `Card` + `Separator`。

**Rationale**: shadcn/ui 的 Chart 基于 Recharts，压缩后体量在百 KB 量级，
而章程原则 IV 给的初始 chunk 预算是 500KB gzip。为一页概览的一个横向分布图引入图表库，
会吃掉相当一部分预算，而这一页的信息（各类别多少台）用横条 + 数字完全表达得了。
概览是 P6 优先级的附加页，不值得为它压缩其余页面的预算。

**Alternatives considered**:
- 用 Chart 并把它做成路由级懒加载 —— 可行，初始 chunk 不受影响。若日后概览页要加趋势图
  （已列入"本版不做"），这是升级路径。本版不做，因为当前需求用不上。

**验证**: 构建后检查初始 chunk 体积，纳入 CI。

---

## D10. 前端路由库 —— 已由章程 v1.1.0 批准

**Decision**: 使用 `react-router`。开发者于 2026-08-28 选定方案 A，章程已修订至 v1.1.0。

**问题**: 章程「技术栈约束 → 前端」列出的是 Vite、React、TypeScript、Tailwind CSS、
shadcn/ui、TanStack Query，**没有路由库**。而章程同一节写明"替换或**新增框架级依赖**
必须先修订本章程"。11 条路由的 SPA 需要路由库，这属于框架级依赖，因此**严格说本项目
无法在不修订章程的前提下引入任何路由方案**。

**三个可选项**:

| 选项 | 说明 | 代价 |
|------|------|------|
| A. 章程加 `react-router`（推荐） | 生态最成熟，shadcn/ui 的示例与文档默认与之搭配 | 需要一次章程 PATCH 修订 |
| B. 章程加 `@tanstack/react-router` | 与已选定的 TanStack Query 同源，类型安全的路由参数 | 同样需要修订；生态与文档少于 A；团队学习成本更高 |
| C. 不用路由库 | 自行基于 `history` API 做最小路由 | 无需修订章程，但要自己处理嵌套路由、参数解析、导航守卫 —— 为省一个依赖而重写它，与章程原则 I「新增依赖需说明被拒绝的替代方案」的精神相反 |

**注**: `react-hook-form` 与 `zod` 不在此列 —— 它们是 shadcn/ui `Form` 组件自带的实现，
随组件生成物一同引入，属于"使用 shadcn/ui"的一部分，不视为新增框架级依赖。

**处置（已完成）**: 开发者选定 **A**。章程于 2026-08-28 修订至 v1.1.0，
「技术栈约束 → 前端」新增 `react-router`，并澄清 `react-hook-form` + `zod` 属于
shadcn/ui 生成物、不另计为框架级依赖。plan.md 的 Gate 结论已相应更新为通过，
阻塞解除，可进入 `/speckit-tasks`。

**版本号更正**: 本条最初预估该修订为 PATCH。按章程自身的版本策略，
往技术栈新增一项此前不存在的强制依赖属于「对既有条款作实质性扩展」，应为 **MINOR**。
实际发布为 1.1.0。
