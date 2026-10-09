# 031 合约与容器冒烟收口证据

日期：2026-10-08。本记录只覆盖接口合约、合约测试及部署冒烟脚本；不替代主验证记录或真实容器运行结果。

## 修改范围

- `specs/001-asset-ledger-demo/contracts/openapi.yaml` 与 `internal/httpapi/docs/openapi.yaml` 保持字节相同。
- `specs/031-selective-field-inheritance/contracts/inheritance.md` 明确零资产撤回也需确认、无问题撤回才签发凭据、解绑成功 204，并将字段计数修正为 `{"count": N}`。
- `internal/httpapi/docs_contract_test.go` 新增解析后结构断言；保留原有四个入口的 `schema_stale` 错误信封与示例测试。
- `deploy/smoke.sh` 保留健康检查、前端、登录、元数据、打印能力、重启与持久化流程，增加真实确认与新路由的结构检查。

## 接口一致性

对照实际草稿解码、预览响应、确认签名及解绑处理器核对：

- 草稿接受 `confirmation_token`；预览不再被错误约束为只能返回空串。
- HMAC-SHA256 凭据绑定操作、目标、规范化完整草稿、schema、完整影响和资产校验数据；响应分页不缩小摘要范围，重启后旧凭据失效。
- 缺少凭据为 `409 confirmation_required`；非空无效或过时凭据为 `409 impact_stale`；都使用 `ErrorEnvelope`，禁止客户端自动换 token 重试。
- 新增 `POST /categories/{id}/bindings/{field_id}/unbind-preview`，返回共用 `CategoryPreview`。
- `DELETE /categories/{id}/bindings/{field_id}` 接受可选 JSON token；无 body 请求仍可被正确解析，存在撤回时不能跳过确认。
- 预览问题包含适用的 `asset_id` 与 `conflict_asset_id`。
- 新增 `GET /fields/{id}/asset-count`，返回包含必需非负整数 `count` 的对象，不是分页信封；认证边界、404 及实际有效到达口径有明确说明。
- 资产保存、更新、导入预览和提交的 `schema_stale` 合约与测试继续保留。

## 红绿过程与验证

1. 新增合约断言后，在旧合约上实际失败：缺少草稿 token、预览 token 被限定为空串、缺少资产问题定位、解绑预览/可选 token、确认错误示例及字段计数路由与响应模型。
2. 更新两份合约后，定向测试实际通过：

   ```text
   GOMAXPROCS=2 go test -p 1 ./internal/httpapi \
     -run '^(TestEmbeddedContractMatchesTheSpec|TestContractDocuments.*)$' -count=1
   ok github.com/klskk23/nexus-assets/internal/httpapi 0.038s
   ```

   YAML 路径项含路径级 `parameters` 数组，测试采用具名 `Get/Post/Patch/Delete` 结构解码，避免把数组误当 operation 映射；访问同步改为具名字段，不再二次索引 struct。
3. `bash -n deploy/smoke.sh` 通过。
4. 抽取脚本内 Python JSON 校验器并用 `compile(..., 'exec')` 检查语法，通过。
5. 两份 OpenAPI 的字节相等检查通过；限定修改文件的 `git diff --check` 通过。
6. 中途复跑遇到共享工作区暂态编译失败：`internal/asset/schema_effects.go:48:9: undefined: scanSchemaAssets`，已通知主会话，未越界修改。随后同一定向命令最终复跑通过（`ok github.com/klskk23/nexus-assets/internal/httpapi 0.044s`），并再次通过 `bash -n` 与限定文件的 `git diff --check`。

## 冒烟脚本新增行为

- 无资产撤回签发非空 token；无 token、伪造 token、使用旧 token 提交改动后的草稿均拒绝；核对失败后有效字段未变，再用原草稿真实 token 保存成功。
- 字段计数验证匿名 401、不存在字段 404；建立两个真实资产，其中一个始终位于未选择字段的兄弟类别，计数随实际选择和撤回走 `0 → 1 → 0`，不是只测空数据库。
- 直接解绑预览验证匿名 401、不存在目标 404、成功分页结构、两个类别撤回与一个去重资产、非空 token。
- DELETE 无 body、伪造 token、其他操作 token 均拒绝；带本次解绑 token 成功 204，随后确认下游字段撤回和计数为零。
- `schema_stale` 保留入口认证与确定性非法输入检查，并明确竞争条件由 HTTP 屏障测试覆盖，脚本不伪称制造了 schema 并发竞争。

## 验证边界

首次合约任务只运行静态与定向验证，没有据此宣称真实冒烟通过。

随后主会话完成最终镜像构建；首次真实smoke在缺version用例失败：请求`{}`被四个required成员的绑定校验提前拒绝，响应只有validation_failed/message，没有fields。执行代理实际复现后仅补齐夹具的category_id、owner_id、holder_type、holder_id，继续故意缺version并严格断言fields.version，未修改生产代码。

最终 `PORT=18132 bash deploy/smoke.sh nexus-assets:031-smoke` 退出0，结尾 `smoke passed: nexus-assets:031-smoke`；包含新增继承确认、count、解绑、原流程、healthcheck、restart及挂载DB。日志`/tmp/031-smoke-fixed.log`，失败诊断`/tmp/031-smoke-diagnostic.log`；临时容器已清理。完整Go、CGO0构建、万级种子verify的最终证据见主`verification.md`。未读取.env或操作生产库。

最后页外唯一冲突错误分类修复后，再次从冻结源码重建镜像并运行同一完整smoke，均退出0；最新日志 `/tmp/031-close-docker-build.log`、`/tmp/031-close-docker-smoke.log`。镜像ID `sha256:ff32b5740408c89d6f9af4a69a3a7bf52e1109e64bf6ea63b7a531e55184dd12`；所有临时容器已清理，未push或发布tag。HTTP回归另精确验证中英422及字段UUID定位，未把smoke冒充并发竞争测试。
