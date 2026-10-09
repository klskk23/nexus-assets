# 重算与必要计算专项验证

本记录仅覆盖 T044 的独立重算持久化安全，以及 T047/T054 的必填、恢复值与必要计算验证，不替代主 verification 或完整交付门禁。

## 实施范围

- `internal/asset/recompute.go`：一致只读事务内生成重算计划；按字段 ID 的实际有效到达选择资产，包含型号/厂商设备字段；字段重算只计算该字段及正向依赖闭包。
- 同一调用的全部根/资产只使用一个写事务。首个资产、搜索或唯一索引写入之前，检查所有参与规划的资产 schema fingerprint 与 version，包括计算结果不变但参与最终唯一判定的资产。
- version 批量查询，不逐资产查库。删除/版本变化返回版本冲突，相关 schema 变化返回 `schema_stale`。
- 重算不调用普通 Save/Persist；保留静态必填存量豁免。唯一值使用已有批量 claims 的先释放、后插入机制，合法值交换不会被中间态拦截，第二资产写失败也整批回滚。
- `internal/asset/schema_compute.go`：每次计划局部的表达式/拓扑缓存，按 schema fingerprint 复用；始终通过 `compute.Parse` 的 AST 护栏。求值上下文只包含最终有效属性，归档属性不能提供输入；新求值结果继续经 `Program.Run` 检查空值、缺失和运行失败。
- `internal/asset/schema_asset_plan.go`：新增带缓存 helper。主会话解除文件独占后，已在 `schema_effects.go` 的 Plan 循环外初始化共享缓存，所有资产复用该缓存；移除不再使用的独立调用 wrapper。
- 新增 `recompute_safety_test.go` 和 `inheritance_required_compute_test.go`，全部使用真实 SQLite 临时库，无 mock、sleep 或生产测试开关。

## 红灯证据

命令：

```sh
GOMAXPROCS=2 go test -p 1 ./internal/asset -run 'TestRecomputeField(UsesActualReach|BatchWriteFailure)' -count=1
```

修改前退出 1：

- `TestRecomputeFieldUsesActualReachAndLeavesUnrelatedComputations`：`validation failed for unrelated`。只重算目标字段，却执行了无关且运行失败的表达式。
- `TestRecomputeFieldBatchWriteFailureRollsBackAllRoots`：`failed field recompute partially committed`。第二 root 写失败后，第一个 root 已经提交。

随后将无关字段的初始合法结果显式在资产创建时生成，保留对其值不变的断言。

## 通过的专项验证

```sh
GOMAXPROCS=2 go test -p 1 ./internal/asset -run 'Test(Recompute|Inheritance|SchemaComputationCache|SchemaEffectsRestoresOnlyNecessaryComputations|SchemaEffectsRestoreStaticValues)' -count=1
```

退出 0，最后一次输出 `ok .../internal/asset 2.835s`。覆盖：

- 全部既有类别/字段重算回归、dry-run、冲突、历史编号保留、无变化 no-op。
- 未选择后代不被重算，无关表达式不求值。
- 跨 root 第二次写入失败时整批资产、唯一、搜索、流转状态不变。
- 明确的读计划完成边界之后，再提交 schema 撤回、公式变化、资产 version 变化；旧计划整批拒绝且零写入。
- 结果未变化的资产 version 变化同样拒绝整个计划。
- 设备计算字段实际到达及两台资产合法唯一值交换，保留旧历史。
- 初次继承必填字段不虚构值，不阻断存量；新建及既有资产下次保存都要求补齐。
- 非空静态旧值的类型、格式、范围、规范化和唯一冲突。
- 新增/恢复计算字段、正向依赖更新、无关计算保留。
- 空计算结果、缺少输入、归档输入、最终唯一冲突均拒绝，不落计算、版本或索引。
- 同一 schema 编译结果复用、schema 改变重新编译、缓存不跨计划；动态下标、遍历及未知名字仍被 AST 护栏拒绝。

```sh
GOMAXPROCS=2 golangci-lint run ./internal/asset/...
GOMAXPROCS=2 go vet ./internal/asset/...
gofmt -l internal/asset/recompute.go internal/asset/schema_compute.go internal/asset/schema_asset_plan.go internal/asset/recompute_safety_test.go internal/asset/inheritance_required_compute_test.go
git diff --check -- internal/asset/recompute.go internal/asset/schema_compute.go internal/asset/schema_asset_plan.go internal/asset/recompute_safety_test.go internal/asset/inheritance_required_compute_test.go
```

以上均退出 0；lint 为 `0 issues.`，gofmt 和 diff 检查无输出。

## 全量 Go 实跑结果

```sh
GOMAXPROCS=2 go test -p 1 ./...
```

已运行，退出 1，不能记作全量通过。运行期间其他代理仍在修改确认、绑定和消费者代码；以下实际失败已全部通知主会话，由相应文件负责人收口：

| 包 | 失败测试/编译项 |
|---|---|
| asset | `TestOrphanValuesSurviveALaterSave`、`TestGetSplitsOrphanKeys`：旧解绑测试未提供确认凭据 |
| asset | `TestUnbindingAnInputAnExpressionReadsIsRefused`：错误描述断言不匹配 |
| httpapi | `handlers_metadata.go` 的 `io` 未使用，包编译失败 |
| importer | `TestInheritanceOutputParentColumnsLeaveUnselectedDescendantEmpty`：不适用导入值未拒绝 |
| schema | `TestBindGateRefusesUnmetDependencies`、`TestBindGateAcceptsAnInheritedInput`、`TestUnbindGateRefusesWhileSomethingReadsTheField` |
| schema | `TestNonUniqueDisplayKeyKeepsFieldSettingsAndReferenceGuards`、`TestUnbindLeavesTheDefinitionAlone`、`TestUnbindPrunesDescendantSelectionsWithoutRestoringThem`：确认流程回归 |

本次其余包通过，包括 cmd/nexus、compute、store、transfer。完整输出位于本会话临时日志：
`/tmp/claude-1000/-home-land-project-nexus-assets/b5895a29-abb9-4d89-b2a8-4d917d639307/tasks/befnp1ezd.output`。

## 后续收口验证

按主会话明确分工追加处理两个旧测试和共享缓存接线：

- `TestOrphanValuesSurviveALaterSave`、`TestGetSplitsOrphanKeys` 的合法解绑改为 `PreviewUnbind` → 检查无 issues 且有 token → `UnbindConfirmed`，保留归档值断言，不放松生产确认守卫。
- `SchemaEffects.Plan` 循环外创建局部编译缓存，循环内统一调用 `planSchemaAssetCached`，移除未使用 wrapper。

```sh
GOMAXPROCS=2 go test -p 1 ./internal/asset -run 'Test(OrphanValuesSurviveALaterSave|GetSplitsOrphanKeys|SchemaComputationCache|SchemaEffects|Inheritance|Recompute)' -count=1
GOMAXPROCS=2 golangci-lint run ./internal/asset/...
git diff --check -- internal/asset/orphan_test.go internal/asset/pipeline_test.go internal/asset/schema_effects.go internal/asset/schema_asset_plan.go
```

以上退出 0：定向测试 `ok .../internal/asset 3.349s`，lint `0 issues.`，diff 检查无输出。没有重复运行全仓测试；上节全量失败仍是当次实际结果，不改写为全绿。

未修改 tasks 或主 verification；未读取 `.env`，未提交、推送、打 tag 或发布。全量修复后需主会话重新执行全量验证；本专项记录不授权部署。
