<!-- SPECKIT START -->
当前计划：`specs/001-asset-ledger-demo/plan.md`

开工前必读，按优先级：

1. `.specify/memory/constitution.md`（v1.1.0）—— 五项不可协商原则与七条合并门禁
2. `specs/001-asset-ledger-demo/plan.md` —— 技术上下文、目录结构、章程门禁核对
3. `docs/design-baseline.md` —— 数据模型、保存管线、元数据变更规则与 API 表面的唯一事实来源
4. `specs/001-asset-ledger-demo/spec.md` —— 6 个用户故事、73 条功能需求
5. `specs/001-asset-ledger-demo/data-model.md` —— 状态机、校验规则、关键不变量
6. `specs/001-asset-ledger-demo/research.md` —— 10 项实现级决策与需要运行时验证的三处
7. `specs/001-asset-ledger-demo/contracts/` —— API 全局约定与端点契约
8. `specs/001-asset-ledger-demo/quickstart.md` —— 运行、构建、测试与门禁命令

**最容易违反的四条硬规则**

- **组件必须来自 shadcn/ui。** 不存在时必须先与开发者确认才能自定义，**不接受事后补批**。
  类别树用 `Collapsible` 递归组合，不引入树组件。
- **前端测试必须含 DOM 测试**（Vitest + React Testing Library，断言 `getByRole` 与
  `userEvent`）。只测纯函数或只做快照比对不算数。触及 UI 的 PR 必须新增或更新 DOM 测试。
- **文档中文、代码英文。** 例外是 i18n 文案（UI 文本、`label`、`error.message`），
  集中在 `web/src/i18n/zh.ts` 与 `internal/httpapi/messages.go`。
- **SQLite 写事务一律 `BEGIN IMMEDIATE`，写连接池为 1。** 这是应用层唯一性校验成立的前提，
  不是性能选项。
<!-- SPECKIT END -->
