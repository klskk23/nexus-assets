# Implementation Plan: 可配置的状态

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-configurable-statuses/spec.md`

## Summary

把状态从五个 Go 常量变成一张表，同时**一条既有护栏都不放松**。

状态从 001 起就不只是标签：它们各自携带合法转换、持有方约束、是否计入库存、
签出／归还的推导，以及一份在前端与导出器里各存一遍的中文名。要允许自定义状态，
这五处都得从「按常量判断」改成「按数据判断」——每一处都是把一个具体规则一般化，
而不是把它删掉。

转换规则是唯一没有被完整一般化的地方，这是有意的：内置对内置沿用原矩阵，
涉及自定义才放行（research.md D1）。代价是规则不再整齐，换来的是既有行为零变化。

## Technical Context

**Language/Version**: 同 003 —— Go 1.26；TypeScript 5.x + React 19

**Primary Dependencies**: **无新增依赖**

**Storage**: SQLite 单文件。新增迁移 `migrations/004_statuses.sql`：
新建 `statuses` 表并写入五条内置记录。**无表重建**，可安全回滚，因而不需要
002／003 那样的 `NO TRANSACTION`

**Testing**: 同 001–003。新增用例覆盖：迁移种子的行为等价性、
自定义状态不放松内置规则、键名／颜色校验落在 422 而非 500、
删除的两条判定、状态管理页的 DOM 交互

**Target Platform / Project Type / Performance Goals**: 同 001

**Constraints**: `assets.status` 不加外键（FR-002）；
颜色是色板名而非像素值（FR-009）；徽章样式必须写在 @layer 之外（research.md D4）

**Scale/Scope**: 4 个用户故事、17 条功能需求、1 次迁移、新增 5 个端点。
后端约 12 个文件、前端约 12 个文件

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依据 `.specify/memory/constitution.md` v1.1.0。**必须逐条填写符合情况，不得以「通过」一词概括。**

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：规则挂在 `model.StatusSet` 上，仓储在 `internal/schema/status_store.go`，`internal/httpapi` 只做绑定与错误映射。行／集合的扫描器收在 `internal/store/statuses.go` 一处，`schema` 复用它而非各写一份。**圈复杂度**：`CanTransition` 的分支是三条（同态、终态、内置对内置），每条都有注释说明为什么。**新增依赖**：零 |
| II | 测试标准 | **核心管线**：转换规则、删除判定、占用统计在包内测试。**端点集成测试**：五个新端点全覆盖，另加一条端到端用例（建状态 → 转入 → 概览计数 → 删除被拒）。**DOM 测试**：`tests/statuses.test.tsx` 七条，断言 `getByRole` 与 `userEvent`，覆盖列表、颜色类、内置无删除入口、行内改色、新建、删除前的代价说明、拒绝的呈现位置。**覆盖率**：核心五包维持 ≥ 80% |
| III | 用户体验一致性 | 全部组件取自 shadcn/ui，**自定义组件仍为 0**。状态管理页复用 `CrudPage`（对话框新建 + 表格 + 三态），删除复用 `ConfirmDialog` 并要求输入键名 —— 与信息项、类别、资产的删除完全同形。徽章用 `Badge`，颜色通过 CSS 变量注入而**不改 shadcn 生成的 badge.tsx** |
| IV | 性能要求 | 状态表最多几十行，`useStatuses` 在前端由 react-query 缓存、全应用共用一份。`AllStatusUsage` 是两条聚合查询，与状态数无关。概览的类别分布从 `WHERE status != 'retired'` 改为按 `category_id, status` 分组后在 Go 里过滤 —— 分组基数从 N 变为 N×状态数（个位数倍），换来的是「哪些状态计入」可配。**bundle**：无新增依赖 |
| V | 语言规范 | 状态标签**移出** i18n 进入数据库。这不违反原则 V：该原则针对的是代码里写死的文案，而状态标签现在是管理员输入的数据，与信息项的 `label`、类别的 `name` 同一性质。`tests/i18n.test.ts` 的动态索引白名单相应从 `zh.status` 改为 `zhStatuses.colors` |

**技术栈约束**：无变化，无新增依赖，无偏离。

**Gate 结论（Phase 0 前）**：五项原则全部通过。

**Gate 结论（Phase 1 设计后）**：通过。设计中确认的两条边界 ——
「转换规则按内置／自定义切分」与「色板名存在三处」—— 均登记在下方，各自写明理由与代价。

## Project Structure

### Documentation (this feature)

```text
specs/004-configurable-statuses/
├── spec.md              # 功能规格
├── plan.md              # 本文件
├── research.md          # Phase 0 产出：6 项实现级决策
├── data-model.md        # Phase 1 产出：表结构、规则落点、删除判定
├── quickstart.md        # Phase 1 产出：配置一个自定义状态的完整路径
├── checklists/
│   └── requirements.md  # 规格质量检查清单
├── contracts/
│   ├── README.md        # 相对 001–003 的契约增量说明
│   └── openapi.yaml     # 新增端点的契约（增量）
└── tasks.md             # Phase 2 产出
```

### Source Code (repository root)

不新增包。下表只列出本特性触及的位置：

```text
migrations/
└── 004_statuses.sql          # 新增：statuses 表 + 五条内置种子

internal/
├── model/
│   ├── model.go              # AllStatuses → BuiltinStatuses；Valid() → Builtin()；
│   │                         # 新增 Status 结构体
│   └── status.go             # 规则挂到 StatusSet 上；CanTransition 按内置／自定义切分
├── store/statuses.go         # 新增：Queryer、StatusColumns、ScanStatus、LoadStatusSet
├── schema/status_store.go    # 新增：列表／新建／修改／删除／占用统计
├── asset/
│   ├── overview.go           # 卡片按配置枚举；类别分布按 counts_as_available 过滤
│   ├── validate.go           # ValidateHolderForStatus 接收 StatusSet
│   └── pipeline.go           # 转换校验从事务内读状态集
├── transfer/
│   ├── transfer.go           # applyOne / checkHolderForStatus 接收 StatusSet
│   └── edit.go               # 同上
├── importer/export.go        # 删掉重复的标签表，改读数据库
├── audit/audit.go            # 新增 TargetStatus
└── httpapi/
    ├── server.go             # 新增 5 条路由
    ├── handlers_statuses.go  # 新增
    ├── handlers_assets.go    # 持有方校验读状态集
    ├── handlers_transfers.go # 目标状态改为查配置而非查常量
    ├── handlers_metadata.go  # unwrapSentinel 认识两个新哨兵
    └── errors.go             # ErrStatusInvalid → 422

web/src/
├── index.css                 # 色板（两套主题各一份）与 .status-chip
├── lib/types.ts              # AssetStatus 放宽为 string；Status、StatusUsage、PALETTE
├── features/statuses/
│   ├── useStatuses.ts        # 新增：唯一的标签／颜色解析入口
│   └── StatusBadge.tsx       # 新增
├── routes/Statuses.tsx       # 新增：状态管理页
├── routes/{Assets,AssetDetail,Overview}.tsx  # 改用 StatusBadge / useStatuses
├── features/assets/NewAssetDialog.tsx        # 选项来自数据
├── features/transfers/{TransferDialog,Timeline}.tsx  # 同上
├── routes/{router,AppShell}.tsx              # 路由与导航
└── i18n/zh.ts                # 撤销 zh.status；新增 zhStatuses
```

**Structure Decision**: 新增目录 `features/statuses/`，而不是把 `useStatuses`
塞进 `lib/`。它是一个带 react-query 的特性钩子，与 `features/theme/useTheme` 同类；
`lib/` 放的是无状态工具。`StatusBadge` 与它同处一个目录，因为二者共享同一个数据来源，
分开只会让下一个人两处都要读。

## Complexity Tracking

**当前无章程违反项。**

### 边界登记

| 事项 | 性质 | 处置 |
|------|------|------|
| 转换规则按内置／自定义切分 | 规则一致性边界 | 完整一般化会让 `lost → in_use` 这条 001 起就有的护栏失效。矩阵编码的是这五个状态已知的语义，系统对自定义状态一无所知。理由见 research.md D1，用例见 `TestCustomStatusDoesNotLoosenBuiltinRules` |
| 色板名存在三处 | 重复边界 | 颜色必须在写入处校验、在渲染处上色，两处不可合并；第三处是前端下拉的选项。三处都有注释指向彼此。若日后增删槽位，`PaletteColors`、`PALETTE`、`index.css` 必须同时改 |
| `.status-chip` 写在 @layer 之外 | 样式约定边界 | Badge 的 variant 是 utility，层内规则盖不过它。备选是改 shadcn 生成的 `badge.tsx`，章程不允许。未分层规则优先于任何层内规则是级联层规范的明文行为，不是技巧 |
| `assets.status` 不加外键 | 数据完整性边界 | 与 `field_definitions` 的删除保护同理：应用层已有拦截，再做一次 `assets` 表重建（第三次）换不到新保证。代价是数据库层允许写入不存在的状态键 —— 前端与 API 均已有回退显示（FR-017） |
| 内置状态可改名不可改行为 | 一致性边界 | 「允许设置颜色」已经承认这五个的呈现可配；只让改色不让改名没有理由。行为开关不同：`in_stock` 关掉位置约束不会让盘点问题变得可答，只会让系统不再问。`PATCH` 对内置**静默忽略**这三个字段而非报错，因为界面上它们本就不出现 |
