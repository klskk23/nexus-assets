# 031 verify 实施与验证证据

日期：2026-10-08。分支：`031-selective-field-inheritance`。

本文仅记录 T051/T059 与 verify 相关门禁，不代替主 `verification.md`，不修改 `tasks.md` 的勾选状态。

## 实施范围

- `cmd/nexus/verify.go`：所有元数据、资产、事件与索引读取放入同一个 `ReadTx`；保留逐资产事件链与最终物化状态检查。
- `cmd/nexus/verify_indexes.go`：从同一 `SchemaSnapshot` 的单资产有效集和原始属性独立推导 expected unique/search。双向检查缺失、残留、重复 live 行、value、原始类别/设备 scope，以及 live suppression；不使用持久化同步函数生成 expected。
- `cmd/nexus/verify_schema.go`：树/path、根选择、直接绑定重复选择、直接父级候选、编号、计算依赖/必填输入/环/表达式护栏，包含无资产的型号组合；按实际绑定矩阵判 key 冲突；一致读事务中的外键完整性检查补充孤儿选择与悬挂引用。
- 普通归档唯一历史不按当前 schema 重建或清理；撤回保留值、抑制历史与主动恢复均可正常对帐。所有验证都是只读，不修复数据。
- 新增测试仅在 `cmd/nexus/verify_*_test.go`，未修改 `main.go`、`setup_inheritance_test.go` 或其他包。协调后额外接管 `cmd/nexus/seed.go` 的真实回归修复：根类别字段绑定完成后，一次更新子类别显式选择 mac/firmware/sn，保持依赖完整。

## 测试先行证据

1. 新增 `verify_inheritance_test.go` 后运行：

   ```sh
   GOMAXPROCS=2 go test -p 1 ./cmd/nexus -run 'TestVerify(Detects|Binding|Withdrawal)' -count=1
   ```

   在实现前实际失败：unique scope/live suppressed/duplicate、search 漏项/错误值/残留、11 类树/选择/依赖损坏未报告，合法兄弟类别与不相交设备字段被误报、同字段跨绑定模式未报告、合法撤回被旧 path 并集误报。修复后同组通过。日志：`/tmp/verify-red.log`、`/tmp/verify-green.log`。

2. 新增孤儿选择测试后运行 `TestVerifyDetectsMissingReferences`，`selection_category` 实际失败（返回 nil）。加入只读外键检查后通过。日志：`/tmp/verify-fk-red.log`。

3. 新增生产命令 `seed 10` → `verify` 测试，发现默认空继承使 4 台子类别种子无 mac/sn 有效索引：预期 20 条 live claims，实际 12 条；原命令和 verify 均成功，说明必须断言实际种子产物而不能只测退出码。协调后接管 `seed.go`，显式选择父类三个字段，真实生产 seed 产物断言转绿。日志：`/tmp/verify-cli-red.log`、`/tmp/verify-final-cmd.log`。

## 真实 SQLite 覆盖矩阵

- 索引：unique/search 双向，value、scope、suppressed、重复；设备/厂商字段、空值/缺值及非唯一编号。
- 结构：根选择、跨层选择、直接绑定重复、path、树环、失效编号、缺失/非必填 computed 输入、计算环、非法动态下标、无资产型号依赖。
- key 矩阵：同链保守拒绝；兄弟合法；类别与设备必冲突；相同型号/厂商冲突；不相交型号/厂商合法；型号与实际厂商交集；同 ID 型号与厂商去重合法；同 ID 类别与设备混绑非法。
- 迁移：真实迁移 023 结构插入三级类别/资产/current 与普通 archived claims/事件，再升级到 024，验证选择回填、对帐与数据零修改。
- 历史：合法普通改号、真实资产效果撤回/恢复、断链、缺历史、首事件非 create、owner 缺失；不伪造流转事件。
- 一致性：在元数据已读、资产未读时通过确定性查询屏障触发独立真实写连接删除搜索索引；当前一致读仍通过，下次 verify 看见损坏。无 sleep、无 mock 数据结果。
- 只读：损坏库验证前后比较类别、定义、绑定、选择、资产、两种索引、事件与审计完整行集，保持不变。
- CLI：真实 seed/verify 调度，错误命令/count/config；本地 HTTP healthcheck 路径、状态码、连接失败与监听地址归一；version/healthcheck 不创建数据库。

## 本任务最终门禁

- `GOMAXPROCS=2 go test -p 1 ./cmd/nexus -count=1 -coverprofile=/tmp/verify-cover.out`：**通过**，整包 **319/375 语句 = 85.07%**（Go 输出 **85.1%**）。seed 回归修复后本包全绿；这是整个包的分母，包含 main/serve/healthcheck/seed，并未靠筛选 verify 文件替代章程包门禁。日志 `/tmp/verify-final-cmd.log`。
- 全部 `verify*.go` 核心合计：**212/222 语句 = 95.50%**；分母含原有事件逻辑及所有新 verify 生产文件，不筛选新增文件替代整包。
- `GOMAXPROCS=2 golangci-lint run ./cmd/nexus/...`：通过，0 issues。
- `GOMAXPROCS=2 go vet ./cmd/nexus/...`：通过。
- `git diff --check`：通过。
- 全量 `GOMAXPROCS=2 go test -p 1 ./...` 已运行两轮；并行实现期间尚非全绿，见下表。未在本任务范围外修改失败测试或业务逻辑。

| 全量运行 | 实际未通过项 |
|---|---|
| 第一轮 `/tmp/verify-all-go.log` | importer 编译时暂缺 assetModelID；schema 三种 binding effects fail-closed 子例、确认/创建computed依赖以及旧继承依赖测试 |
| 第二轮 `/tmp/verify-all-go-second.log` | 本任务 seed claims 回归；asset `TestOrphanValuesSurviveALaterSave`、`TestGetSplitsOrphanKeys` 确认要求，`TestUnbindingAnInputAnExpressionReadsIsRefused` 错误文案；schema `TestUnbindGateRefusesWhileSomethingReadsTheField` 错误文案；importer `TestInheritanceOutputParentColumnsLeaveUnselectedDescendantEmpty`；httpapi rows 测试编辑中未使用 import |

以上两轮全量记录保留实际失败，不把其他代理正在修复当作已通过。协调要求避免并发重复全量测试，因此本任务最终只复跑 cmd/nexus 整包、覆盖率、vet 与 lint；整个项目最新全量结果由主会话统一验证。本任务未读取 `.env`，未 commit/push，未改 CI。

覆盖率统计从 Go coverprofile 各块的 `NumStmt` 求和，以执行次数大于零为已覆盖；文件拆分未移除原事件逻辑。全部 verify 核心分项：`verify.go` 79/82，`verify_indexes.go` 58/59，`verify_schema.go` 75/81。
