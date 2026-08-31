# Implementation Plan: 中英双语与持有方生命周期

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

## Summary

两件事，一件大一件小。

小的那件是把持有方补齐到其他配置对象已有的形状：可编辑、可删除，
删除在被引用时拒绝并说清是什么挡着。003 曾明确决定不做，理由是流转历史引用它；
004 给状态确立的「当前数据拒绝、历史记录提示」把那个理由变成了一条可执行的规则，
于是现在可以做了。

大的那件是双语。它不是把字符串换个地方放 —— 它要求**领域层不再决定用什么语言说话**。
约 100 条服务端消息从 `fmt.Errorf` 改为「目录键 + 参数」，由 HTTP 边界按
`Accept-Language` 渲染一次；前端 457 处引用改名并接上一个可切换的字典。

## Technical Context

**Language/Version**: 同 005 —— Go 1.26；TypeScript 5.x + React 19

**Primary Dependencies**: **无新增依赖**。没有引入 ICU、gettext 或任何 i18n 运行时 ——
两种语言、一份手写目录，加一个库要付的是构建体积与一套新语法

**Storage**: 新增迁移 `migrations/006_holder_delete.sql`：删掉 `holder_entities.archived_at`。
无表重建（SQLite 3.35+ 的 `DROP COLUMN`），Down 可逆但有损（谁曾被停用不可恢复）

**Testing**: 新增 `internal/i18n` 的目录一致性测试、`internal/httpapi/language_test.go`
的端到端语言验证、`web/tests/language.test.tsx` 的切换测试，
以及持有方编辑删除的单元、端点与 DOM 测试

**Constraints**: 前端字典是模块级 live binding，切换靠重挂整棵树传播（research.md D4）；
测试环境固定为中文

**Scale/Scope**: 4 个用户故事、15 条功能需求、1 次迁移、新增 2 个端点。
后端约 25 个文件、前端约 32 个文件

## Constitution Check

依据 `.specify/memory/constitution.md` v1.1.0。**必须逐条填写符合情况。**

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：语言只在 HTTP 边界出现，领域层返回 `i18n.Message`；唯一的例外（导入预览、CSV 导出）接收 `lang` 参数，因为它们的产物不向上传播。**圈复杂度**：`Message.In` 的分支是「有无参数」「参数是否可翻译」两处，各有注释。**新增依赖**：零 |
| II | 测试标准 | **核心管线**：`internal/i18n` 8 条（键一致、参数槽一致、回退、哨兵可 `errors.Is`、链上查找、Accept-Language 解析）。**端点集成测试**：`language_test.go` 覆盖拒绝、字段级消息、CSV 表头三类；持有方的删除与 usage 各有用例。**DOM 测试**：`language.test.tsx` 5 条、`holderHierarchy.test.tsx` 新增 5 条编辑删除。**覆盖率**：核心五包维持 ≥ 80% |
| III | 用户体验一致性 | 全部组件取自 shadcn/ui，**自定义组件仍为 0**。语言切换是 `Button`（两种语言用切换而非下拉）；持有方编辑用 `Dialog`、删除用 `ConfirmDialog` 并要求输入名称 —— 与信息项、状态、类别完全同形 |
| IV | 性能要求 | 目录是两个 map，进程内常驻。前端多出一份英文字典（gzip 后 +5.5KB，407KB → 未越过 500KB 的门禁）。切换语言清空 react-query 缓存并重挂一次树 —— 一次会话里发生几次 |
| V | 语言规范 | **本轮修订了这条原则的表述**。原文是「用户可见文案是中文，集中在两处」；现在是「用户可见文案集中在目录中，每条在每种语言里都有译文」。标识符、注释、日志、`error.code`、CSV 键名行仍然全部是英文。`internal/httpapi/messages.go` 清空并留下指路的注释，而不是删掉文件 —— 那是下一个来找它的人会打开的路径 |

**Gate 结论（Phase 0 前）**：五项原则全部通过，原则 V 的表述随本特性修订。

**Gate 结论（Phase 1 设计后）**：通过。两条边界登记在下方。

## Project Structure

```text
migrations/
└── 006_holder_delete.sql       # 去掉 holder_entities.archived_at

internal/
├── i18n/                       # 新增包
│   ├── i18n.go                 # Lang、Message、Wrap、Text、Join、Parse
│   ├── keys.go                 # 目录键常量
│   ├── catalog.go              # zh / en 两份目录
│   └── i18n_test.go            # 一致性与行为
├── holder/store.go             # Archive → Delete + Usage；消息迁入目录
├── httpapi/
│   ├── errors.go               # LangOf / FailMsg / FailField；userText 改为查表
│   ├── messages.go             # 清空，留指路注释
│   ├── handlers_metadata.go    # DELETE /holders/:id、GET /holders/:id/usage
│   └── language_test.go        # 新增
└── {asset,schema,transfer,auth,importer}/  # 消息迁入目录

web/src/
├── i18n/
│   ├── zh.ts                   # 去掉 as const，成为字典的形状
│   ├── en.ts                   # 新增，类型对齐
│   ├── index.ts                # 新增：Lang、detectLang、live binding、locale
│   └── useLanguage.tsx         # 新增：Provider 与切换
├── lib/api.ts                  # 每个请求带 Accept-Language
├── routes/AppShell.tsx         # 语言按钮；导航改为函数
├── routes/Holders.tsx          # 编辑对话框 + 删除
└── （其余 28 个文件）           # zh* → t* 的机械改名
```

**Structure Decision**: 服务端的目录放在 `internal/i18n` 而不是 `internal/httpapi`：
`internal/schema`、`internal/holder` 等都要引用键常量，放在 httpapi 下会让领域层
反向依赖传输层。前端 `src/i18n/index.ts` 是唯一的导出面，
`zh.ts`/`en.ts` 只被它和类型引用。

## Complexity Tracking

**当前无章程违反项。**

### 边界登记

| 事项 | 性质 | 处置 |
|------|------|------|
| 原则 V 的表述被修订 | 章程边界 | 「文案是中文」在双语系统里无法成立。收窄为「文案不写在组件与领域代码里」——**这条原则真正保护的东西**。标识符、日志、错误码、CSV 键名行的规则一字未改。已在 plan 的原则 V 一栏与 spec 顶部写明 |
| 前端字典是模块级 live binding | 反应式边界 | 换来的是 457 处引用只需改名。代价是切换语言会重挂整棵树、清空组件状态，写在 `LanguageProvider` 的注释里。备选是给 28 个文件的每个组件加一行 hook —— 更「正确」，但那一行在每个文件里都可能被漏掉，而漏掉不会被任何东西发现 |
| 模块级常量必须手工找出 | 检测边界 | 在导入时求值的字典引用不会被 typecheck 抓到，本轮有两处（导航、流转动作）。用一个扫描顶层 `const` 的脚本找出来的；这个检查没有进 CI —— 下一次加模块级常量时可能重演。已在 CLAUDE.md 的硬规则里点明 |
| 英文不做复数规则 | 文案边界 | `device(s)` 而不是 ICU plural。两种语言、这个规模下，plural 库的成本大于收益 |
| 持有方类型不可改 | 范围边界 | 改类型会让下级指向规则不允许的上级类型，而「那些下级怎么办」没有用户同意过的答案。删了重建把这件事说在明处 |
| 006 的 Down 有损 | 数据边界 | 恢复 `archived_at` 列，但谁曾被停用不可恢复。停用机制已经没有任何写入方，这个信息在 Up 之后就不再产生 |
