<!-- SPECKIT START -->
当前计划：`specs/002-identity-and-transfer/plan.md`

开工前必读，按优先级：

1. `.specify/memory/constitution.md`（v1.1.0）—— 五项不可协商原则与七条合并门禁
2. `specs/002-identity-and-transfer/` —— 本轮特性的规格、计划、决策与任务
3. `docs/design-baseline-v2.md`（决策 25–40）—— 编号模型、依赖门禁、流转与型号绑定。
   **与 v1 冲突时以本文为准**
4. `docs/design-baseline.md` —— 原始设计基线（决策 1–24）。编号相关部分已被 v2 取代
5. `specs/001-asset-ledger-demo/` —— 上一轮特性：6 个用户故事、73 条功能需求、
   状态机与校验规则、API 全局约定。其 `contracts/openapi.yaml` 仍是**全量**端点清单

**最容易违反的五条硬规则**

- **组件必须来自 shadcn/ui。** 不存在时必须先与开发者确认才能自定义，**不接受事后补批**。
  类别树用 `Collapsible` 递归组合，不引入树组件。
- **前端测试必须含 DOM 测试**（Vitest + React Testing Library，断言 `getByRole` 与
  `userEvent`）。只测纯函数或只做快照比对不算数。触及 UI 的 PR 必须新增或更新 DOM 测试。
- **文档中文、代码英文。** 例外是 i18n 文案（UI 文本、`label`、`error.message`），
  集中在 `web/src/i18n/zh.ts` 与 `internal/httpapi/messages.go`。
- **SQLite 写事务一律 `BEGIN IMMEDIATE`，写连接池为 1。** 唯一性现在由
  `asset_unique_values` 上的部分唯一索引保证（v2 决策 32），所以这条不再是正确性前提，
  但保持不变 —— 放宽没有收益。
- **`assets` 没有 `sn` 列。** UUID 是唯一内部标识；人能读的编号是某个标为唯一的信息项，
  由类别的 `display_key` 指定，未指定时回退 UUID 前 8 位。改动编号相关代码前先读 v2 文档。
<!-- SPECKIT END -->
