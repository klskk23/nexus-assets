<!--
Sync Impact Report
==================
Version change: 1.0.1 → 1.1.0
Bump rationale: MINOR。往「技术栈约束 → 前端」新增一项此前不存在的强制依赖（路由库），
                属于对既有条款的实质性扩展，而非不改变约束语义的细化。
                （规划阶段曾预估为 PATCH，据本章程自身的版本策略更正为 MINOR。）

Modified principles: 无
Added sections: 无
Removed sections: 无

Modified content:
  「技术栈约束 → 前端」新增两条：
    - 路由：react-router（强制）
    - 表单：react-hook-form + zod 随 shadcn/ui Form 生成物引入，不另计为框架级依赖

Rationale for the addition:
  001-asset-ledger-demo 有 11 条前端路由，其中含路径参数与需要可分享的筛选态 URL。
  SPA 没有路由库无法表达这些。而 v1.0.1 的前端技术栈列表未列出任何路由方案，
  同节又规定「新增框架级依赖必须先修订本章程」—— 形成阻塞，故先修订。
  被拒绝的替代方案见 specs/001-asset-ledger-demo/research.md 决策 D10。

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — Constitution Check 的技术栈约束段落已补入
  ✅ .specify/templates/spec-template.md   — 不涉及技术选型，无需修改
  ✅ .specify/templates/tasks-template.md  — 不涉及技术选型，无需修改
  ✅ specs/001-asset-ledger-demo/plan.md   — 阻塞项已解除，Gate 结论改为通过
  ✅ specs/001-asset-ledger-demo/research.md — D10 标记为已批准
  ✅ CLAUDE.md                              — 阻塞提示已移除

Follow-up TODOs: 无

--- 历史 ---
v1.0.1 (2026-08-27) 回填 SQLite 驱动：modernc.org/sqlite，CGO_ENABLED=0 与 DSN pragma 形式
v1.0.0 (2026-08-27) 首次批准：五项核心原则、技术栈约束、开发工作流与质量门禁、治理规则
-->

# Nexus Assets 项目章程

本章程定义 Nexus Assets（内部路由设备资产台账与流转系统）的不可协商开发原则。
条款中「必须 / 禁止」为强制要求，违反即阻断合并；「应当」为默认做法，偏离需在
`plan.md` 的 Complexity Tracking 中记录理由。

## Core Principles

### I. 代码质量 (Code Quality)

代码在被人读懂之前不算写完，因此可读性与静态可验证性优先于个人风格偏好。

- Go 代码必须通过 `gofmt -l` 检查（输出为空）、`go vet` 与 `golangci-lint run`，
  三者均零告警方可合并。
- 前端代码必须通过 `tsc --noEmit` 与 ESLint，二者均零错误方可合并。
- 禁止吞掉错误：Go 中不得以 `_ = err` 丢弃 error；错误向上传递时必须用
  `fmt.Errorf("...: %w", err)` 包装，保留错误链。
- 分层边界必须保持：`internal/httpapi` 只负责 HTTP 编解码、参数绑定与错误
  envelope 转换，业务逻辑禁止写在 handler 内。
- 单个函数圈复杂度必须 ≤ 15（由 `golangci-lint` 的 `gocyclo` 强制）。超限时必须
  拆分，或在 PR 描述中给出无法拆分的具体理由。
- 禁止提交调试残留（`fmt.Println`、`console.log`）、被注释掉的代码块、以及不带
  issue 或 task 编号的 `TODO`。
- 新增第三方依赖必须在 PR 描述中说明理由与被拒绝的替代方案。

**理由**：本系统的核心复杂度集中在保存管线与元数据演化规则上（见
`docs/design-baseline.md` 第 4、5 节）。这些逻辑一旦被埋在过长的 handler 或被吞掉的
error 里，故障将表现为静默的数据损坏而非可见的崩溃。

### II. 测试标准 (Testing Standards) — NON-NEGOTIABLE

测试覆盖的对象是「写错了会静默损数据的逻辑」，而不是行数。

- 以下六块核心管线逻辑必须有单元测试，且测试须覆盖失败分支：继承字段集解析、
  MAC 规范化、computed 拓扑求值与环检测、唯一性校验、SN 重算与冲突回滚、
  `verify` 对帐。上述包的语句覆盖率必须 ≥ 80%。
- 每个 HTTP 端点必须有集成测试，运行于真实的 SQLite 临时库，不得使用 mock 存储层。
- **前端测试必须包含 DOM 测试**：使用 Vitest + React Testing Library，断言真实渲染
  结果与用户交互（`getByRole` / `findBy*` / `userEvent`）。仅测试纯函数或仅做快照
  比对不满足本条。每个用户可见的交互路径至少一条 DOM 测试。
- 任何触及 UI 的变更，PR 中必须新增或更新至少一条 DOM 测试。
- 修复缺陷必须先提交一条可复现该缺陷的失败测试，再提交修复。
- `nexus verify`（事件流与物化快照对帐）必须在 CI 中对种子库运行并通过。
- 测试禁止依赖执行顺序，禁止用 `sleep` 等待异步结果。

**理由**：资产系统的价值在于记录可信。物化快照漂移、SN 重算撞号、computed 环依赖
这三类故障都不会抛异常，只会让数据悄悄变错，唯一的防线是测试与对帐。

### III. 用户体验一致性 (UX Consistency)

界面一致性靠约束保证，不靠自觉。

- **所有 UI 组件必须来自 shadcn/ui。** 若所需组件在 shadcn/ui 中不存在，
  **必须先与开发者确认并获得明确批准**，才可实现自定义组件。未经确认引入的自定义
  组件在 code review 中直接拒绝，不接受事后补批。
- 经批准的自定义组件必须置于 `web/src/components/custom/`，并在文件顶部注释中
  记录批准依据（日期 + 决策来源）。
- 样式必须使用 Tailwind 工具类与 shadcn/ui 的设计 token。禁止内联 `style` 属性，
  禁止新增全局 CSS 文件（Tailwind 入口文件除外）。
- 加载态、空态、错误态三种状态必须显式实现，禁止出现白屏或无反馈等待。
- 所有写操作必须提供：提交中的 loading 态、成功后的 toast、失败时的 toast。
  失败文案取自 API 响应的 `error.message`。
- 表单校验错误必须定位到具体输入框，数据来源为 API 响应的 `error.fields`。
- 破坏性操作（删除资产、重算存量 SN、停用用户）必须二次确认。
- 所有交互元素必须键盘可达，且 focus 状态必须可见。

**理由**：这是内部工具，使用者是仓库与运维同事而非前端工程师。组件来源统一是让
界面在多人协作下不劣化的唯一低成本手段；三态与二次确认则直接对应本系统会造成
不可逆后果的操作。

### IV. 性能要求 (Performance)

性能目标以本系统的真实量级为准：万级资产、十人级并发，而非通用高并发场景。

- API 响应时间（1 万条资产种子数据下测量）：列表查询 p95 < 200ms，单条读写
  p95 < 100ms。
- 列表类接口必须分页，禁止无上限返回。`limit` 默认 50，硬上限 200。
- 禁止 N+1 查询：渲染一页列表所需的全部数据必须在常数条 SQL 内取得，不得随行数
  增长。
- 任何新增的高频查询路径必须有对应索引；若判断不需要索引，必须在 PR 描述中说明
  依据。
- 前端生产构建初始 chunk 必须 < 500KB（gzip 后）；首屏可交互时间 < 1.5s（本地网络）。
- 前端交互反馈延迟必须 < 100ms；超过 300ms 的操作必须显示 loading 态。
- 无法满足上述任一指标的实现，必须在 `plan.md` 的 Complexity Tracking 中登记，
  说明取舍与后续收敛计划。

**理由**：过度设计的性能架构与性能不达标同样有害。明确上界让「够用即可」成为可
验证的判断，而不是各凭感觉。

### V. 语言规范 (Language Conventions)

- **规格与设计文档必须使用中文**：`specs/**`、`docs/**`、本章程、PR 描述、
  issue 描述。
- **代码相关产物必须使用英文**：标识符、代码注释、commit message、日志输出、
  错误码（`error.code`，英文 snake_case）、数据库表名与字段 key、API 路径与参数名。
- **例外（i18n）**：面向最终用户可见的文案使用中文，包括 UI 文本、字段 `label`、
  枚举选项 `label`、API 返回的 `error.message` 与逐行导入校验提示。这些文案应集中
  管理，不散落在业务逻辑中。
- 同一文件内禁止中英文混写标识符或注释。

**理由**：规格文档的读者是团队与决策者，中文降低歧义；代码的读者还包括工具链与
未来的贡献者，英文保证可移植与可搜索。把 i18n 文案单列为例外，是为了让「用户看到
的字」与「机器读到的字」在结构上就分开。

## 技术栈约束 (Technology Stack Constraints)

本节列出的技术选型为强制约束。替换或新增框架级依赖必须先修订本章程。

**后端**

- 语言与框架：Go + Gin
- 数据库：SQLite。写事务一律 `BEGIN IMMEDIATE`，开启 WAL，`busy_timeout=5000`，
  写连接池大小为 1 —— 这是应用层唯一性校验成立的前提，不得更改。
- 迁移：goose，SQL 文件经 `embed.FS` 打包进二进制
- 模板求值：Go 标准库 `text/template` + 函数白名单
- SQLite 驱动：`modernc.org/sqlite`（纯 Go 实现，**不使用 CGO**）。构建必须以
  `CGO_ENABLED=0` 进行 —— 这是「单二进制交付」能够无目标平台 C 工具链直接交叉编译
  的前提，禁止改用需要 CGO 的驱动。
- 连接 DSN 必须显式声明上述 pragma，例如：
  `file:nexus.db?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)`
- 测试：Go 标准 `testing`

**前端**

- 构建：Vite
- 框架与语言：React + TypeScript
- 路由：`react-router`
- 样式：Tailwind CSS
- 组件库：shadcn/ui（强制，见原则 III）
- 数据层：TanStack Query
- 表单：`react-hook-form` + `zod`。二者随 shadcn/ui `Form` 组件生成物一同引入，
  视为 shadcn/ui 的组成部分，**不另计为框架级依赖**，无需为其修订本章程
- 测试：Vitest + React Testing Library + jsdom

**交付**

- 单二进制：前端构建产物经 `embed.FS` 打包，Gin 同时服务 `/api` 与静态文件
- 部署产物 = 一个可执行文件 + 一个 `.db` 文件

**设计基线**

- `docs/design-baseline.md` 是数据模型、保存管线、元数据变更规则与 API 表面的
  唯一事实来源。实现与该文档冲突时，必须先修订文档再改代码。

## 开发工作流与质量门禁 (Development Workflow & Quality Gates)

**流程**

1. `/speckit-constitution` — 建立或修订本章程
2. `/speckit-specify` — 在 feature 分支上撰写中文规格
3. `/speckit-plan` — 产出实现计划，其中 Constitution Check 必须逐条对照本章程
   五项原则
4. `/speckit-tasks` — 拆解任务
5. `/speckit-implement` — 实现

**合并门禁（全部必须通过，缺一不可合并）**

1. `gofmt -l` 输出为空，`go vet` 与 `golangci-lint run` 零告警
2. `tsc --noEmit` 与 ESLint 零错误
3. `go test ./...` 全部通过，核心管线包覆盖率 ≥ 80%
4. `vitest run` 全部通过；若变更触及 UI，必须包含新增或更新的 DOM 测试
5. `nexus verify` 对种子库对帐通过
6. 无未经开发者确认的自定义组件
7. 文档变更为中文、代码变更为英文（i18n 文案除外）

**偏离处理**

任何违反本章程的实现必须在 `plan.md` 的 Complexity Tracking 表中登记：违反项、
必需性理由、被拒绝的更简方案及原因。未登记的违反项一律不予合并。

## Governance

本章程优先于其他一切开发实践、工具默认值与个人偏好。当既有代码或模板与本章程
冲突时，以本章程为准，并须在同一 PR 中修正冲突方。

**修订流程**

- 修订以 PR 形式提交，直接编辑 `.specify/memory/constitution.md`
- PR 描述必须说明：变更内容、版本升级类型与理由、受影响的下游模板与文档
- 须经开发者明确批准后方可合并
- 合并同时必须同步更新 `.specify/templates/` 下受影响的模板

**版本策略（语义化版本）**

- MAJOR：移除原则、重新定义原则语义，或引入与既有实现不兼容的治理要求
- MINOR：新增原则或章节，或对既有条款作实质性扩展
- PATCH：措辞澄清、错别字修正、不改变约束语义的细化

**合规审查**

- 每次 `/speckit-plan` 的 Constitution Check 必须逐条列出五项原则的符合情况，
  不得以「通过」一词概括
- 每次 code review 必须核对上节的七条合并门禁
- 运行时开发指引见 `CLAUDE.md` 与 `docs/design-baseline.md`

**Version**: 1.1.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-28
