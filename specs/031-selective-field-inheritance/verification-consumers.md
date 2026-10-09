# 031 消费者验证证据

本文记录 T048 / T049 / T050 / T055 / T057 / T058 消费者改动的实际验证，不替代总体验证记录。测试使用项目真实临时 SQLite，未读取 `.env`，未提交、推送或委派。

## 改动边界

- `internal/schema/reachability.go`：以字段 ID 计算精确类别与实际型号到达集；集合通过 JSON 参数展开；公开 `FieldReach`、`KeyReach`、`FieldAppliesTo`，以及返回 `(int, error)` 的 `FieldAssetCount`。
- `internal/schema/field_store.go`：searchable 重建按字段 ID 到达集隔离；定义删除不再按裸 key 全库清理。未修改该文件的 CreateField 段。
- `internal/schema/refcheck.go`：引用守卫按真实到达重叠判断；归档非空值保守阻止删除；另一当前有效同 key 定义拥有的值不误拦、不清除；守卫与删除位于同一写事务。
- `internal/asset/query.go`：属性过滤同时检查有效到达和实际值；schema、count、page 使用同一只读事务；大集合保持参数化。
- `internal/importer/template.go`、`export.go`、`rows.go`：模板/rows 去重同 key 设备列；输出每行按字段 ID 适用性取值。`ExportSelected` 与打印复用既有路径，无需改 `export_many.go` 或 `handlers_print.go`。
- 后续协调接入 `internal/importer/preview.go`、`resolve.go`：按每行类别和实际型号解析有效字段；非空不适用列逐行拒绝，空列允许；不再由混合型号的单一 key→定义映射判适用性。未修改 persistence。
- 未修改 confirmation、binding.go、group_store.go、recompute、tasks.md 或 verification.md。

## 已观察的红灯

以下为行为断言失败，不包括中途修正的编译错误。

### 字段身份、搜索、删除、引用

命令：

```sh
GOMAXPROCS=2 go test ./internal/schema -p 1 -run 'TestInheritance(SearchRebuild|DeleteProtects|DeleteDoes|FieldFilter|Referrers)' -count=1
```

观察到：

- `TestInheritanceSearchRebuildUsesFieldIdentity`：未选择继承的后代归档值被重建为搜索值，archived=1，应为 0。
- `TestInheritanceDeleteProtectsUnboundArchivedValues`：无绑定定义带归档值时删除成功，应返回 `ErrFieldInUse`。
- `TestInheritanceDeleteDoesNotRemoveSiblingSameKey`：删除一个定义时，兄弟类别独立同 key 值被清理为 NULL。
- `TestInheritanceReferrersDoNotCrossDisjointModels`：不相交型号上的计算字段被误判为引用。

`TestInheritanceFieldFilterUsesSelectionsNotAncestorPaths` 首次即通过，是既有正确行为的回归检查，不宣称其经历红灯。`FieldAssetCount` 的去重/缺失定义测试为接口实现后补充，同样不宣称红灯。

### 属性过滤

命令：

```sh
GOMAXPROCS=2 go test ./internal/asset -p 1 -run '^TestAttrFilterInheritance' -count=1
```

观察到：

- 未继承后代归档值参与匹配，总数为 2，应为 1。
- 无适用设备字段的第三型号参与匹配，总数为 3，应为 2。

新增大到达集测试使用 1200 个类别和包含 SQL 特殊字符的字面值，检查参数化集合及准确结果。

### 输出与导入

命令：

```sh
GOMAXPROCS=2 go test ./internal/importer -p 1 -run '^TestInheritanceOutput' -count=1
```

观察到：

- 父类别请求输出未选择继承后代的 archived 值。
- 同 key 不同型号定义导致 rows 重复声明列、不适用定义擦除适用定义写入的值。
- 模板 machine-key 行重复同 key。
- 子类导入非空、不适用的 firmware 列被忽略，报告 OK=1，应为 0。

后续导入专门红灯：

```sh
GOMAXPROCS=2 go test ./internal/importer -p 1 -run 'TestInheritance(Import|OutputParent)' -count=1
```

- `TestInheritanceImportResolvesSameKeyPerRowsModel`：四行预期三个合法，实际仅两个；One 型号的合法值被当作 Two 型号字段拒绝。
- `TestInheritanceOutputParentColumnsLeaveUnselectedDescendantEmpty`：不适用 firmware 仍报告 OK=1。

## 绿灯证据

实现后曾分别运行完整 schema、asset 包，通过；其后共享工作树继续有其他修改，最终消费者定向与 importer 全包结果如下。

```sh
GOMAXPROCS=2 go test ./internal/importer -p 1 -count=1
# PASS，1.603s

GOMAXPROCS=2 go test ./internal/httpapi -p 1 -run 'Test(Rows|Export|Print).*Inheritance' -count=1
# PASS，0.234s

GOMAXPROCS=2 go test ./internal/schema ./internal/asset -p 1 -run 'TestInheritance(SearchRebuild|DeleteProtects|DeleteDoes|FieldFilter|Referrers|FieldAssetCount)|TestAttrFilterInheritance' -count=1
# PASS，schema 0.165s；asset 0.279s

GOMAXPROCS=2 go vet ./internal/schema ./internal/asset ./internal/importer ./internal/httpapi
# PASS，无输出

git diff --check
# PASS，无输出
```

覆盖内容包括：兄弟同 key 搜索隔离；未选后代归档删除保护；不相交型号引用隔离；显式选择字段过滤；型号/厂商重复到达计数去重；属性过滤 count/page 一致；大集合参数化；双语 rows；父类导出后代空单元格；跨类别分包；子类打印无归档父列；混合型号同 key 导入和输出；无型号非空设备列拒绝而空列允许；预览无资产落库。

## 全量 Go 的真实状态

本任务已运行一次：

```sh
GOMAXPROCS=2 go test ./... -p 1 -count=1
```

该次 **exit 1**，日志位于执行环境 `/tmp/nexus-consumers-go-test.log`。当时实际失败项：

- `cmd/nexus/TestVerifyCLISeedReconciles`：seed 数量断言与实际 10/10/12/4 不符。
- `internal/asset/TestOrphanValuesSurviveALaterSave`、`TestGetSplitsOrphanKeys`：旧解绑调用收到 confirmation_required。
- `internal/httpapi/TestCyclicExpressionKeyRefusedAtBindTime`：期望 cycle，实际返回缺失依赖 b。
- `internal/httpapi/TestUnbindEndpointDetachesAFieldAndKeepsStoredValues`：旧解绑调用收到 409 confirmation_required。
- `internal/httpapi/TestInheritanceHTTPUnbindConfirmation`：断言 preview/rejected unbind 写入数据。
- `internal/importer/TestInheritanceOutputParentColumnsLeaveUnselectedDescendantEmpty`：不适用导入列被忽略。

最后一项已在上述 importer 全包中修复并验证通过，其余项已交协调者处理；不以之后的定向绿灯冒充全量通过。按后续协调要求未再次运行全量 Go。

## 静态检查剩余项

最终运行：

```sh
GOMAXPROCS=2 golangci-lint run ./internal/schema/... ./internal/asset/... ./internal/importer/... ./internal/httpapi/...
```

当时唯一剩余错误为共享工作树的 `internal/httpapi/inheritance_move_test.go:153` 未 gofmt；本任务未修改该测试，已通知协调者。此前曾出现的其他代理测试格式错误不作为最终状态重复报告。后续补齐统一消费者验收时重新运行 `GOMAXPROCS=2 golangci-lint run ./internal/httpapi/...`，结果为 `0 issues`，该格式阻塞已经消失。

## T062 / SC-005：同一真实夹具跨消费者验收

新增且仅新增测试文件 `internal/httpapi/inheritance_consumers_test.go`，本轮未修改 production。精确入口为 `TestInheritanceConsumersShareOneEffectiveSet`，中文和英文子测试共用同一个 SQLite 数据库及同一组资产，不为各消费者另建替代夹具。

夹具：三级类别 root → middle → leaf；middle 显式选择 live_tag 和 retired_tag，leaf 只选择 live_tag；两个实际型号具有不同字段 ID、相同 device_tag key，另共同继承厂商 vendor_tag。root/middle 各一资产，leaf 两型号各一资产，leaf 原始 attrs 保留 retired_tag 归档值。

同一入口的精确断言映射：

- `checkSchemaAndDetail`：HTTP schema 按型号返回恰好 live/vendor/对应 device 三个字段 ID；资产详情有效 attrs 恰好三项、归档 attrs 恰好 retired_tag，归档值仍在。
- `checkSearchAndCounts`：live 搜索命中四资产；retired 全文搜索与属性过滤仅命中 middle 的有效值而不命中 leaf 归档值；型号值只命中对应资产；字段资产计数分别为 live=4、retired=2、vendor=2、两个 device 各 1。
- `checkTemplateAndImport`：CSV 模板 live/device/vendor 三个键各出现一次，未选择 mac/retired 不出现；真实 multipart 预览两型号同 key 均成功，无型号空设备列成功，非空 retired 列逐行拒绝；预览前后完整数据库状态一致。
- `checkRowsExportAndPrint`：leaf rows 恰好两资产、有效值齐全且无归档列；父类 include_descendants rows 保留父列但 leaf 对应单元格为空；CSV 同 key 两定义各占独立标签列且每行只填对应身份，无归档值；真实 HTTP 打印转发结果逐行、逐列与同夹具 rows 完全一致。

命令与结果：

```sh
GOMAXPROCS=2 go test ./internal/httpapi -p 1 -run '^TestInheritanceConsumersShareOneEffectiveSet$' -count=1
# PASS，0.123s，含 zh/en

GOMAXPROCS=2 golangci-lint run ./internal/httpapi/...
# 0 issues

git diff --check
# PASS
```

这是对既有实现补齐跨消费者验收证据，不宣称新增测试经历过 production 行为红灯。编写期间的 BOM 字面量、型号类型名及导出路径修正仅为测试准备错误，均已修正，不计入 TDD 红灯证据。本轮未重复全量 Go；前端 DOM 由其他任务覆盖。
