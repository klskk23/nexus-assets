<!-- SPECKIT START -->
当前计划：`specs/005-holder-hierarchy-and-custody/plan.md`

开工前必读，按优先级：

1. `.specify/memory/constitution.md`（v1.1.0）—— 五项不可协商原则与七条合并门禁
2. `specs/005-holder-hierarchy-and-custody/` —— 本轮特性的规格、计划、决策与任务
3. `docs/design-baseline-v4.md`（决策 53–60）—— 状态成为可配置的数据。
   **冲突时以最新一版为准：005 的 research.md > v4 > v3 > v2 > v1**
4. `docs/design-baseline-v3.md`（决策 41–52）—— 信息项可删除、型号多对多
5. `docs/design-baseline-v2.md`（决策 25–40）—— 编号模型、依赖门禁、流转
6. `docs/design-baseline.md` —— 原始设计基线（决策 1–24）
7. `specs/001-asset-ledger-demo/` ~ `specs/004-configurable-statuses/` —— 前四轮特性。
   001 的 `contracts/openapi.yaml` 仍是**全量**端点清单

**最容易违反的八条硬规则**

- **组件必须来自 shadcn/ui。** 不存在时必须先与开发者确认才能自定义，**不接受事后补批**。
  类别树用 `Collapsible` 递归组合，不引入树组件。
  **下拉一律用 `Select`，不写原生 `<select>`**；表单布局用 `Field`/`FieldGroup`/`FieldSet`，
  不用 `div + Label`；提示用 `Alert`、空状态用 `Empty`、加载用 `Skeleton`/`Spinner`。
  `Select` 是 Radix 组件不是原生控件，测试要用 `src/test/choose.ts` 的助手而非
  `user.selectOptions`；`SelectItem` 不接受空字符串值，「未选/全部」走 `lib/select.ts` 的哨兵。
- **前端测试必须含 DOM 测试**（Vitest + React Testing Library，断言 `getByRole` 与
  `userEvent`）。只测纯函数或只做快照比对不算数。触及 UI 的 PR 必须新增或更新 DOM 测试。
- **文档中文、代码英文。** 例外是 i18n 文案（UI 文本、`label`、`error.message`），
  集中在 `web/src/i18n/zh.ts` 与 `internal/httpapi/messages.go`。
- **SQLite 写事务一律 `BEGIN IMMEDIATE`，写连接池为 1。** 唯一性现在由
  `asset_unique_values` 上的部分唯一索引保证（v2 决策 32），所以这条不再是正确性前提，
  但保持不变 —— 放宽没有收益。
- **`assets` 没有 `sn` 列。** UUID 是唯一内部标识；人能读的编号是某个标为唯一的信息项，
  由类别的 `display_key` 指定，未指定时回退 UUID 前 8 位。改动编号相关代码前先读 v2 文档。
- **状态是数据，不是常量。** 标签、颜色与三项行为都在 `statuses` 表里。
  标签**不在** `zh.status`（已撤销）—— 前端一律走 `useStatuses()`，
  服务端一律走 `model.StatusSet`。写事务里的判定必须从 `tx` 读状态集，不从连接池读。
  转换规则**内置对内置沿用原 5×5 矩阵**，涉及自定义才放行，这是为了不放松任何既有护栏。
  三个行为开关里，`requires_location` 自 005 起是**策略**（任何状态可改，出厂全关），
  `counts_as_available` 与 `terminal` 仍对内置锁死 —— 判据是「除了约束本身还有谁在读它」。
- **持有方是一棵有规则的树。** 部门必须属于公司，位置可挂公司或部门、也可不挂，
  公司无上级。规则写在 `internal/holder` 的 `allowedParents` 表里，前端有同形一份
  （`web/src/lib/types.ts`）**只用于不提供非法选项**，把关的仍然是服务端。
  移动要防成环。迁移**不回填**存量的无上级部门。
- **信息项没有「停用」。** 只有删除（无关联时）与解绑（有存量数据时）。
  `archived_attrs` 是**解绑**产生的孤儿键，与停用无关，不要跟着一起清理掉 ——
  删掉它会让「解绑后仍能查看旧值」当场失效，且没有任何现有测试会失败。
<!-- SPECKIT END -->
