# 确认凭据补充验证

本记录仅覆盖追加的确认重放、父级 presence、已有凭据遇到新增 issues 的优先级，以及 HTTP 英文/UUID 投影。不替代全量验证，不改 tasks 或主 verification。

## 修改范围

- `internal/schema/category_write.go`：在业务 issues 之前，仅对非空已有凭据执行 `checkConfirmation`。旧确认失效返回 `impact_stale`；无凭据时保持原有业务校验优先，避免把非法草稿误报为需要确认。
- `internal/schema/confirmation_replay_test.go`：真实 SQLite 测试操作/目标重放、父级显式 null 与省略、签名之后新增 schema 依赖问题；拒绝路径检查选择及类别状态不变。
- `internal/httpapi/inheritance_confirmation_extra_test.go`：真实服务与 SQLite 验证英文 `confirmation_required` / `impact_stale`，旧签名遇到新 issues 返回 409，无 token 保持 422；唯一冲突响应携带双方完整 UUID、字段 ID/key，英文消息使用完整 UUID，预览不写入。

没有改现有 HTTP 测试、server 或 `binding_change.go`。

## 真红

```sh
GOMAXPROCS=2 go test -p 1 ./internal/schema ./internal/httpapi -run 'Test(CategoryConfirmation(StaleToken|RejectsOperation|ParentNull)|InheritanceHTTP(StaleWithNewIssues|ConflictProjects))' -count=1
```

修复前退出 1，确实复现生产缺陷：

- `TestCategoryConfirmationStaleTokenPrecedesNewIssues`：已签名预览之后，后代设置原字段为编号，旧草稿提交返回 display-key 业务 issue，而非 `ErrImpactStale`。
- `TestInheritanceHTTPStaleWithNewIssuesUsesEnglishConflict`：HTTP 返回 `422 validation_failed`，预期 `409 impact_stale`。

初次新增 HTTP 冲突测试还错误假设冲突文案应包含字段值；实际既有合约文案为 `Asset <UUID> already uses this value.`。已把断言收敛为英文提示和完整 UUID，未修改生产文案。无 token 的业务校验沿用既有 422，未改为 400。

## 最小修复与回归

生产修复仅在 `saveCategory` 的 plan 成功后、issues 判断前，为非空 `ConfirmationToken` 增加检查。保留之后原有的业务 issues 检查及无 token 确认检查，不改变签名算法或绕过守卫。

重放测试使用同一个真实 store 签名密钥，先验证未变计划的控制签名与预览 token 完全一致，再仅替换 operation、target 或 parent-presence 维度，避免使用无效随机字符串冒充重放覆盖。

```sh
GOMAXPROCS=2 go test -p 1 ./internal/schema ./internal/httpapi -run 'Test(CategoryConfirmation|InheritanceHTTP(Confirmation|StaleWithNewIssues|ConflictProjects))' -count=1
GOMAXPROCS=2 golangci-lint run ./internal/schema/... ./internal/httpapi/...
git diff --check -- internal/schema/category_write.go internal/schema/confirmation_replay_test.go internal/httpapi/inheritance_confirmation_extra_test.go
```

结果均退出 0：最后定向测试 schema `0.343s`、httpapi `0.333s`；lint `0 issues.`；diff-check 无输出。未再次运行全仓测试。

## 直接解绑入口交接

已向协调者提供 `binding_change.go` 的精确同序修复位置，由该文件负责人处理：在 `UnbindConfirmed` 的 `planUnbind` 成功后、issues 判断之前，对非空 `token` 调用 `checkConfirmation` 并立即返回错误；保留原 issues 和后续无 token 检查。本代理未修改该文件，也不把其验证计入本专项。

未读取 `.env`，未提交、推送、打 tag 或发布。
