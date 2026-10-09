# 031 实施验证记录

## 当前边界（2026-10-08 收口）

- 分支：`031-selective-field-inheritance`；Linux、Go `go1.26.2 linux/amd64`；原迁移023，本轮024。
- 正向选择、原始来源、资产效果、HMAC确认、直接绑定/解绑、陈旧保护、实际到达消费者、重算与verify已实现并有专项回归。此前「公开撤回拒绝」「确认尚未实现」描述均为下面保留的阶段历史，不代表当前代码。
- 后端全量测试、gofmt/vet/lint、核心包覆盖率及前端65文件569测试已通过，最后整套复跑见complete日志；最后修复后的新二进制构建、万级seed/verify及Docker重建/smoke见close日志。T005当前隔离mutation负向验证及还原绿、T010迁移/WAL恢复均闭环，不追认为历史红灯。真实消费者DOM、模拟故障浏览器矩阵及最终同库真实后端UI/HTTP/verify贯通验收均已完成。
- **本轮实施与验收69/69项完成，不代表生产发布授权**。真实后端首屏固定业务可交互指标中位226ms、p95/max451ms，五次均<1.5s；不是Lighthouse标准TTI。长事务、O(N)规划内存、tmpfs/非并发性能范围仍见 plan 复杂度记录，未因任务完成而删除或视为获准豁免。
- 未操作生产数据库，未读取 `.env`，未提交、推送、打tag或发布。

## 最终门禁与证据索引

| 门禁/验收 | 实际结果与证据 |
|---|---|
| Go格式/静态检查 | `gofmt -l ./cmd ./internal ./migrations`输出为空；`GOMAXPROCS=2 go vet ./...`退出0；`GOMAXPROCS=2 golangci-lint run`为0 issues。日志`/tmp/031-complete-vet.log`、`/tmp/031-complete-lint.log` |
| Go全量与覆盖率 | `GOMAXPROCS=2 go test -p 1 ./... -count=1 -coverprofile=/tmp/031-complete-cover.out`退出0；`/tmp/031-complete-go.log`，含页外冲突分类修复。schema83.6%、asset84.1%、compute88.1%、cmd/nexus85.1%，六类核心管线所在包均≥80%；importer82.7%。不要求或宣称所有包均≥80% |
| 定向竞争检测 | `GOMAXPROCS=2 go test -race -p 1 ./internal/store ./internal/schema ./internal/asset ./internal/httpapi -run 'Test(ReadTx|Snapshot|SchemaClaim|SchemaEffects|Recompute|Inheritance|SelectiveInheritance|.*Stale)' -count=1`退出0；`/tmp/031-complete-race.log`；最后补充断言后store/schema/asset/HTTP分别5.882/58.907/65.107/46.786s；不是全仓库race |
| 前端静态/DOM/构建 | tsc、eslint、Vitest65文件569测试再次通过（51.41s，`/tmp/031-complete-web-{tsc,eslint,tests}.log`）；最终build通过5.09s（`/tmp/031-complete-web-build.log`），入口gzip215.36KB。警告与模拟浏览器边界见`verification-web.md`，不是零警告或完整生产TTI结论 |
| 静态二进制/种子对帐 | 最后修复后 `CGO_ENABLED=0 GOMAXPROCS=2 go build -p 1`生成全新临时binary；显式NEXUS_ENV_FILE指向不存在的临时文件，独立NEXUS_DB_PATH；`seed 10000`与`verify`退出0。`/tmp/031-close-local-build.log`、`/tmp/031-close-seed10000.log`、`/tmp/031-close-verify10000.log`：10000资产与schema、事件、unique/search全部一致。临时binary和数据库目录已清理 |
| 容器真实smoke | `docker build -f deploy/Dockerfile -t nexus-assets:031-smoke --build-arg VERSION=dev-031 .`成功；最终`PORT=18132 bash deploy/smoke.sh nexus-assets:031-smoke`退出0，包含healthcheck、嵌入前端、新增端点、确认/解绑/count、restart及挂载数据库。最后修复后重建镜像 `sha256:ff32b5740408c89d6f9af4a69a3a7bf52e1109e64bf6ea63b7a531e55184dd12`；`/tmp/031-close-docker-build.log`、`/tmp/031-close-docker-smoke.log`；临时容器已清理 |
| 性能 | 完整万级撤回与三次恢复通过23.585s；普通HTTP p95达标，批量保存0.72–2.78s。见`verification-performance.md`；tmpfs、非十并发、锁上下界及累计分配口径不能省略 |
| 最终同库E2E/首屏 | 最终嵌入生产bundle、真实后端、同库UI/HTTP消费者及恢复/搜索/必填/计算验收，最后verify 4台资产通过；外部打印仅stub。5次禁缓存成功编辑中位226ms、p95/max451ms，追加5.1s静默观察；非Lighthouse TTI。见`verification-web.md`及`evidence/real-browser-performance.json` |
| 合约与文件检查 | 两份OpenAPI `cmp`一致；全量包含文档与双语目录测试；`git diff --check`通过。组件来源及完整UI矩阵仍按前端专项核对 |

### 收口期间出现过的真实失败

- 两次过早的全Go运行读到施工中状态：一次缺scanSchemaAssets helper，一次新增CSV测试含非法BOM；日志`/tmp/031-delivery-go.log`与`/tmp/031-delivery-final-go.log`。后续稳定源码全量绿，不隐去先前失败。
- 万级首次恢复10分钟超时，claims相关JSON子查询超线性；最小3000×3000测试5s真红后改索引驱动查询，定向绿及万级全流程绿。见性能专项。
- 首次最终容器smoke退出1：缺version用例请求`{}`先触发四个required字段绑定错误，根本没到version守卫，断言error.fields导致KeyError。只修测试夹具补category/owner/holder，仍故意缺version并保留严格fields.version断言。生产代码不改；红日志`/tmp/031-smoke-diagnostic.log`，绿日志`/tmp/031-smoke-fixed.log`。

### 收口补充：分页冲突错误分类

`TestInheritanceHTTPPagedOutUniqueConflictBlocksWholeSave` 使用真实SQLite：先撤回唯一字段，再由另一资产占用相同值；恢复草稿包含安全字段与冲突字段。`impact_limit=1` 返回安全字段，`issues_offset=1&issues_limit=1` 返回空问题页但 total=1，预览仍不签token，保存完整规划且所有业务表不变。

新增回归实际暴露保存返回500：唯一冲突的纯 i18n.Message 没有字段错误类型。主会话定向重现（`/tmp/031-paged-conflict-red.log`），随后在 `schema_claim_check.go` 用 `i18n.Wrap(FieldErrors{field.Key: ...}, ...)` 同时保留预览本地化与既有HTTP 422/validation_failed/error.fields 映射；不改HTTP规则、不接受500、不改变事务规划或分页范围。asset claims/effects 与HTTP定向通过（`/tmp/031-paged-conflict-green.log`）。代理进一步补齐中英×有/无分页四次PATCH，精确断言本地化summary与唯一error.fields.paged_claim包含完整冲突UUID，定向、gofmt、vet及diff-check通过（`/tmp/031-http-paged-conflict-test.log`、`/tmp/031-http-paged-conflict-vet.log`）。修复后的全量、镜像和全新本地二进制门禁以close日志记录，未用较早二进制结果替代。

T040实际测试分布在 `schema_claims_test.go`（最终槽交换、同ID来源变化、释放后插入故障回滚）、`schema_claim_plan_test.go`（整批最终冲突）、`schema_claim_check_test.go`（未变化资产最后槽冲突）与上述HTTP分页回归，不为匹配原拟定文件名复制测试。T044另由 `recompute_safety_test.go` 的真实到达、设备交换、整批写失败、schema/资产版本陈旧保护覆盖。

最后收口曾从仓库根用 `npm --prefix web exec -- eslint web` 运行，ESLint未定位到web目录配置而退出2，Vitest未执行。这是命令工作目录错误，未改配置或生产代码；改为进入web执行tsc、eslint、Vitest后整串退出0。保留此失败说明，不误报产品回归或首次全绿。

### T001 规则核对

已逐项核对六份规则：schema 的祖先自动并集由031逐层正向选择替代，设备实时传播及同链key守卫保留；domain 的raw归档、历史搜索抑制、逐行字段身份和恢复严格校验已同步；expr 保持expr-lang/expr、AST护栏与白名单；web-tables 保持列表双形状、类别只读主从页与Dialog编辑、设备列由型号/厂商解锁；web-forms 新增完整草稿/冻结确认/UUID/真实缓存失效，保持Nocturne和shadcn；printing 保持单类别、dry_run确认及服务端转发，rows只输出逐行有效值。031不重新引入型号与类别关联、不扩权限、不改打印服务协议。

环境、分支、迁移号、失败和后续命令已在本记录及专项登记，没有读取.env。

### T005/T010 当前负向验证闭环

2026-10-08在临时源码副本执行 `/tmp/031-migration-mutation.py`。仅复制allowlist Go/SQL和go.mod/sum，不复制.env或运行数据库；仅在副本中突变024，共享迁移SHA256始终为 `5699757ab41ee150219d2b28a257905c34cf4e6f1bd66c3916727cb6e0989973`。

| 隔离突变/恢复 | 实际结果 |
|---|---|
| 仅删除CREATE TABLE category_field_selections语句，保留索引和回填 | 真实023旧库测试失败：`no such table: main.category_field_selections`，exit1 |
| 仅删除INSERT OR IGNORE ... SELECT回填，保留DDL/index/suppression | WAL测试失败：`backfilled selections = 0, want child + leaf`；旧库测试同时发现Down不再拒绝，exit1 |
| 逐字节恢复迁移，store/schema整包 | exit0，0.744s/5.948s |
| 迁移、失败回滚、唯一历史、WAL备份恢复定向 | exit0，0.330s |
| snapshot、真实旧库等价与后来父字段不自动继承定向 | exit0，1.123s |

WAL演练再次确认119512字节已提交数据不在主文件视图却完整进入一致备份；升级回填2项，新写入独立保全，拒绝不安全Down且全表/schema不变，023新路径恢复通过完整性与外键检查，024原库/保全副本仍保留新增资产。临时复制目录已清理。

精确命令与退出码在 `/tmp/031-migration-close/results.json`，两次突变diff、红日志和三份还原后绿日志在同目录。初次临时驱动仅因匹配Go日志空白格式退出，修正驱动后整套重新成功，非产品故障。

**这是当前mutation负向验证，不是补造历史测试先行证据。** T005要求的旧结构覆盖、缺表/缺回填失败可探测性及原子回滚现已验证；历史过程缺口仍如实保留，不再将无法回溯的历史记录当作功能永远不能完成的条件。T010的迁移前置、WAL备份、升级后写入保全及恢复演练据此闭环。

### T002 与 T062：夹具及消费者证据边界

T002已完成：schema复用真实SQLite `newStore`与`seedSnapshot`三级/多分支/同key不同ID夹具；HTTP复用`newHarness`及`newInheritanceConsumersFixture`的三级类别、混合型号/厂商和归档值；DOM复用`renderWithProviders`与各测试文件的类别/字段夹具。测试数据与开关均留在测试支持代码，不要求跨包共用一个巨型helper。

`TestInheritanceConsumersShareOneEffectiveSet` 确实在同一个真实SQLite库、同一组混合型号资产上核对中英schema/详情、搜索与计数、模板及逐行导入、rows/CSV/HTTP打印转发。真实组件DOM现覆盖详情/编辑、录入、列表、导出、导入与打印；恢复/必填/计算及verify由各自独立真实库专项覆盖。

上述分层证据原先不能独自满足T062，因此先保留未勾；现已另用最终嵌入生产bundle、真实localhost后端及**同一独立临时SQLite**贯穿三级类别、混合型号/厂商的浏览器撤回、详情/编辑、编号、列、录入、模板导入、CSV/rows、打印出站投影，并在同库演练恢复、唯一冲突/解除、历史搜索、必填及计算，最后 `nexus verify` 对4台资产通过。应用API没有mock；仅外部打印为本地stub，不代表实体出纸。T062据此完成，不将旧DOM夹具改称真实E2E。

T064的中英/键盘/窄屏/故障矩阵复用前端专项实际记录；新增真实后端首屏5次禁缓存样本为451/217/214/226/228ms（导航至点击后编辑弹窗可见），中位226ms、nearest-rank p95/max451ms；各追加5102ms静默窗口无Long Task、HTTP并发0。首次启动84ms Long Task在可交互之前结束。按固定业务可交互定义完成本地网络<1.5s验收，不冒充Lighthouse算法。方法、无凭据JSON及截图见 `verification-web.md` 的T062/T064节。

同库演练首次有脚本/夹具适配失败，修正后连续执行成功，未改生产代码；`recovery.log`和`conflict.log`是首次失败日志，不是整脚本一次全绿。最终verify独立成功日志为 `/tmp/031-real-e2e/verify.log`（20:54:22）。计算失败/唯一冲突的完整事务快照仍由后端专项覆盖。规则同步与quickstart第4–6节由同库演练及这些明确分层的回归共同验收。

### T046：quickstart 第3节映射

本节是实际已运行自动化测试的验收映射，不冒充额外的人工端到端操作；对应文件已包含在最终Go非缓存全量、前端全量及定向race中。

| quickstart 第3节 | 真实验证 |
|---|---|
| 1 撤回预览、冻结与取消 | inheritanceConfirmation DOM中的完整影响/分页/取消测试；HTTP ConfirmationRoundTrip 与资产effects回滚快照 |
| 2 当前编号可修正、后代编号阻断 | categoryDraftDependencies 两项真实DOM；HTTP MoveDescendantDisplayBlocksWholeDraft；schema DisplayUsesOnlyFinalCategoryFields |
| 3 缺计算输入不自动选择 | schema PreviewReportsComputedDependency、ChecksDeviceComputedWithoutAssets；DOM显示issues并保留可修正草稿 |
| 4 完整计算链一起撤回 | schema AllowsRemovingCompleteComputedChain、ChecksDescendantComputedDependency、ChecksTransitiveComputedDependencies；类别草稿DOM |
| 5 字段编辑器解绑同等守卫 | inheritanceConfirmation 中解绑取消、token提交、stale后二次确认；最终真实Docker smoke解绑流程 |
| 6 预览后数据变化必须重新确认 | HTTP ConfirmationStaleDraft、schema确认资产身份/版本矩阵；DOM keeps failed stale drafts / separate confirmation；模拟API生产bundle浏览器再验证 |
| 7 Prepare/Persist与重算竞争 | HTTP及importer schema_stale屏障、RecomputeRejectsStaleBatchBeforeAnyWrites，最终race通过；不是sleep模拟 |

移动的ID交集/原始来源、后代资产与环、后代编号、注入失败path/selection回滚、同链key守卫由 `internal/httpapi/inheritance_move_test.go` 五项测试覆盖；最终全量已执行，不另把源码存在当通过证据。

### T069 静态收口检查

只读检查未发现新增基础组件、翻译或合约覆盖缺陷。新增 `CategoryInheritance`、`InheritanceConfirmation`、`InheritanceImpact` 都组合仓内已跟踪的shadcn primitives；没有新增components/ui/custom基础组件或框架依赖。字典引用在render内求值，不冻结模块级live binding；双语目录及后端参数一致性由全量测试覆盖。

四个新增路由均在router、两份OpenAPI和smoke中对应：创建/编辑preview、unbind-preview、field asset-count；smoke包含认证、404、token拒绝与成功、计数和解绑，schema_stale竞争另由确定性HTTP测试覆盖。`cmp`与`git diff --check`通过。

安全检查只读路径元数据：`.env`、`nexus.db`及web/dist均被忽略；跟踪配置仅既有.env.example，暂存区为空；HEAD仍为d6c3f1a，v0.17.2是既有tag，不是本轮发布。未读取密钥或生产库。本检查不替代T005/T010/T062/T064的实际执行；这些验收现已分别按上文闭环，T069随最终diff-check与合约一致性检查完成。七条门禁的证据分别为Go静态、前端静态、Go全量与核心覆盖率、DOM全量、种子verify、shadcn来源审查和中英文产物规范检查。既有前端警告及已登记性能偏离保留，不宣称零警告或已获生产放行。

### 后续历史记录阅读方式

下面记录按实施阶段保留；其中「尚未」「待补」只描述当时状态。当前完成度以本节、专项最终证据及tasks复选框为准，不把早期缺口重复报告，也不把未测项追认为通过。

## 一致读与迁移基础

前序阶段已执行并通过：

- `go test ./internal/store -run 'Test(SelectiveInheritanceMigration|MigrateUpAndDown|ReadTx|WriteQuerier)' -count=1`
- `go test ./internal/store -count=1`

包含一致读事务、写事务读自身更新、023 旧结构回填、空库 Down 与有选择数据时拒绝 Down。完整旧库业务结果等价、故障注入回滚和备份恢复仍须在 T009–T010 补齐验证；现有迁移测试不能替代这些验收。

## 快照与选择解析（2026-10-08）

### 测试先行记录

1. 新增 `internal/schema/snapshot_test.go`，运行 `go test ./internal/schema -run TestSnapshot -count=1`，退出 1：缺少 `Store.Snapshot` 与 `LoadSchemaSnapshot`。这是新增 API 尚不存在的编译阶段红灯，不冒充运行期行为失败。
2. 加入快照批量加载、逐层选择解析及缓存隔离后，相同命令退出 0。
3. 新增 `TestSnapshotRejectsUnselectedAncestorKeyConflict`；单独运行退出 1：未继承的祖先同 key 冲突错误实际为 `<nil>`，与保守同链守卫不符。
4. 增加与选择无关的祖先直接绑定冲突检查后，`go test ./internal/schema -count=1` 退出 0。
5. 补充已有实现的边界回归：同排序稳定性、嵌套 options 与设备到达集的返回值隔离、旧快照不受后来写入影响、新建子类默认空、父类新增不下传、根选择非法、父链环拒绝。补充测试首次运行通过，不标记为新增行为的红绿循环。

### 当前已覆盖

- 固定 ID 的三级、多分支夹具，按父字段顺序继承，再追加自身直接绑定。
- 孙类字段来源仍为最初直接绑定的祖先，必填、唯一、可搜索与排序保持。
- 兄弟不同字段 ID 可以使用相同 key；同链未继承的相同 key 仍被拒绝。
- 非直接父类有效集的选择被拒绝，根类别不能选择自身字段作为继承。
- 型号与厂商同一字段按 ID 去重、保留到达信息；不相交型号的同 key 不同字段保留为不同身份。
- 类别字段、单资产设备字段和混合型号可能字段三种语义分开。
- 从当前写事务读取未提交选择，回滚后新快照不保留该选择。
- 批量加载至多八条查询；重复解析 100 次不追加 SQL。
- 返回字段、数值选项指针及设备到达切片不会被调用者修改后污染缓存。

### 实际命令与结果

| 命令 | 结果 | 范围说明 |
|---|---|---|
| `go test ./...`（实施前基线） | 退出 0 | 当前工作树的后端基线 |
| `go test ./internal/schema -run TestSnapshot -count=1` | 退出 0 | 快照新增定向测试 |
| `go test ./internal/schema ./internal/store -count=1` | 退出 0 | 两包非缓存回归 |
| `go vet ./internal/schema ./internal/store` | 退出 0 | 两包静态检查 |
| `go test ./...`（最后一次快照改动后） | 退出 0 | 全仓库 Go 测试，部分包使用 Go 缓存 |
| `go vet ./...` | 退出 0 | 全仓库 vet |
| `go test -race ./internal/schema -run TestSnapshot -count=1` | 退出 0 | 快照测试开启 race detector |
| `gofmt -l internal/schema/snapshot.go internal/schema/snapshot_load.go internal/schema/snapshot_test.go internal/schema/resolve.go` | 输出为空，退出 0 | 本次快照相关 Go 文件 |
| `git diff --check` | 退出 0 | 无空白错误 |

运行中使用 gofmt 格式化改动的 Go 文件。尚未进行本轮完整覆盖率、golangci-lint、前端测试与构建、种子库 verify、smoke、浏览器走查和性能门禁；七条合并门禁不能标记为全部通过。

## 读取入口接入与旧夹具（2026-10-08）

1. `TestStoreFieldReadersUseExplicitSelections` 首跑五个子测试全失败：实际 `[a b c d]`，期望 `[a c d]`。切换 EffectiveFields、FieldsOfPath、FieldsForAsset、EffectiveFieldsForAsset、EveryPossibleField 后通过。
2. 首轮全仓库回归退出 1；日志 `/tmp/nexus-031-selected-full.log`。schema、asset、HTTP 旧夹具仍假定新建子类自动继承，未降低原有 MAC、必填、计算、唯一、搜索或重算断言，改为测试专用显式选择。
3. asset 夹具修正后仍有两个真实失败：`TestOrphanValuesSurviveALaterSave`、`TestGetSplitsOrphanKeys`，祖先解绑遗留失效选择，读取报 `selects field ... absent from its parent`。
4. 新增 `TestUnbindPrunesDescendantSelectionsWithoutRestoringThem`，首跑重现同样失败；在解绑事务内清除该来源子树选择后通过。随后加入「解绑非直接绑定不得影响后代」断言，首跑失败；增加 RowsAffected 判断后通过。独立分支同字段 ID 的选择保留，重新绑定不会恢复已撤回选择，引用守卫失败保留原数据。
5. 上述解绑清理只是保持中间态结构一致性，**不是** T033–T035 的完整撤回服务：确认 token、资产版本、唯一历史抑制和最终依赖仍待实现，不能部署此中间态。

| 命令 | 实际结果 |
|---|---|
| `go test ./internal/schema ./internal/asset -count=1` | 退出 0（schema 2.537s，asset 4.120s） |
| `go test ./... > /tmp/nexus-031-full-after-fixtures.log 2>&1` | 退出 0，全仓库回归通过 |
| `go vet ./...` | 退出 0 |
| `git diff --check` | 退出 0 |

## 下一执行点

- T008 的读取快照及既有 Store 入口已经接入并验证。
- T009 的真实旧库业务等价测试正在补充；T010 待完成备份恢复演练。
- T001–T002 的全目录规则核对、HTTP/DOM 共用夹具尚未全完成，保持未勾选。
- T011 起推进 presence 草稿、只读规划和提交；存量影响在真实资产效果与确认实现前必须 fail closed。

## T010：临时 WAL 备份、升级与恢复演练（2026-10-08）

本节记录随后完成的 T009 定向验证及 T010 恢复演练，不修改前面的历史执行记录。仅新增测试文件 `internal/schema/migration_selection_test.go`、`internal/store/migration_backup_test.go`，并细化 quickstart 第 1 节；没有改生产代码、任务勾选或其他验收章节。

### 实测内容

- T009：真实 goose 建到 023，直接 SQL 建旧结构夹具，实际以旧 `BindingsByCategory + Resolve` 捕获迁移前有效字段；另以固定预期核对 ID、顺序、来源、options、类型、必填、唯一、可搜索。根、子、孙、兄弟四个类别组成三级多分支，覆盖同 sort 的逆 ID 插入稳定次序，以及合法兄弟同 key 不同 ID。024 后完整 `BoundField` 逐项相等，快照入口与公开 `EffectiveFields` 都检查；真实 `CreateField + Bind` 给根、子新增字段，已有后代不自动继承。首跑即绿，是既有实现的集成回归，不冒充新增 red→green。
- T010：所有数据库均为 `t.TempDir()` 下新建文件。关闭临时连接自动 checkpoint，清空 WAL 后提交旧数据；WAL 为 **119512 字节**，只读 immutable 主文件视图资产数为 **0**，正常连接及一致性备份含 **1** 台资产。该对照证明备份包含尚在 WAL 中的已提交数据；没有复制活跃主 db。
- 对正常连接执行参数化 `VACUUM INTO ?` 生成 `before-023.db`；包含全部表（含 goose 与 sqlite_sequence）及 schema 的逻辑内容一致，版本为 **23**，完整性检查通过。
- `working.db` 升级到 **24**，回填子、孙 **2** 个选择；随后插入第 2 台资产及唯一/搜索索引、创建事件，并以 `VACUUM INTO ?` 另存 `preserved-024.db`，逐表/schema 验证全部升级后写入已保全。
- populated `MigrateDown` 返回明确的 `migration 024 down is unsafe`；前后版本均为 **24**，全部表/schema 相等，不留下部分 Down。未清空选择或 suppression 绕过守卫。
- 从 023 备份再次 `VACUUM INTO ?` 到独立 `restored-023.db`；版本为 **23**，全表/schema 与升级前逐项相等，`integrity_check=ok`、`foreign_key_check` 无行。恢复库有 **1** 台旧资产，024 工作库与保全库仍各有 **2** 台；没有覆盖现有库，明确证明旧备份不含升级后写入。

### 实际命令与结果

均在仓库根目录顺序运行，未并行启动测试。

| 命令 | 结果 |
|---|---|
| `gofmt -w internal/schema/migration_selection_test.go` | 退出 0 |
| `GOMAXPROCS=2 go test -p 1 ./internal/schema -run '^TestMigrationSelectionPreservesLegacyFieldsWithoutFutureInheritance$' -count=1` | 退出 0，0.036s |
| `GOMAXPROCS=2 go test -p 1 ./internal/schema -count=1` | 退出 0，2.431s；此时为 T009 完成后的完整 schema 包回归 |
| `gofmt -w internal/store/migration_backup_test.go` | 退出 0 |
| `GOMAXPROCS=2 go test -p 1 ./internal/store -run '^TestSelectiveInheritanceWALBackupUpgradeAndRestore$' -count=1 -v` | 退出 0，0.061s；输出上述 WAL、拒绝 Down、新路径恢复及保全断言 |
| `GOMAXPROCS=2 go test -p 1 ./internal/store -count=1` | 退出 0，0.549s |
| `GOMAXPROCS=2 go vet ./internal/store` | 退出 0 |
| `gofmt -l internal/schema/migration_selection_test.go internal/store/migration_backup_test.go` | 输出为空，退出 0 |
| `git diff --check` | 退出 0 |

### 仍未完成与安全边界

- **T005 的升级中途故障注入/半回填回滚测试仍缺失**。现有 `TestSelectiveInheritanceMigrationBackfillsLegacyEffectiveFields` 和本次 populated Down 拒绝测试均不能替代“Up 中途失败原子回滚”。因此不宣称 T005–T009 所有要求已经通过，也不将 T010 整体勾选完成。
- T009 全包通过后，父会话开始 T011/T014 preview 的测试先行工作；该阶段曾因新 API 未实现出现 schema 编译红灯，父会话日志为 `/tmp/nexus-031-preview-red.log`。这是另外阶段的已知中间态，不归因于迁移，亦不能用 T009 的较早绿色冒充当前全仓库通过。T010 此阶段只单跑 store。
- 备份恢复保全的是两个各自一致的时间点，**没有自动合并升级后写入**。实际回退须先停写、保存并验证当前 024 库、另行评估升级后数据的导出和回放，再恢复 023 到新路径并配套旧程序；不能无声覆盖新写入。
- 未读取 `.env`、未接触真实库、未 commit/push/tag/发布；本节不是生产操作授权或完整交付证明。全部安全链与合并门禁仍须后续完成。

## T005 补充：024 最终版本写入故障与原子回滚（2026-10-08）

T010 演练后按追加任务新增 `internal/store/migration_failure_test.go`，补上前述“Up 中途故障注入”缺口；不改生产代码或任务勾选。此补充取代上节对此特定缺口的“仍缺失”状态，不代表 T005 的其他全部场景或整轮门禁自动完成。

- 真实 goose 升到 023，复用测试专用旧库夹具：根、子、孙、父类字段直接绑定、显示编号、资产属性、唯一/搜索索引及创建事件。
- 对 `goose_db_version` 安装临时测试数据库内的 `BEFORE INSERT WHEN NEW.version_id = 24` 触发器；该触发器先确认 **2 条选择已回填、反向索引存在、search_suppressed 列存在**，才执行 `RAISE(ABORT, 'injected 024 version write failure')`。因此故障确实发生在 024 所有 DDL/回填完成之后，不是开头的 SQL 拼写错误。
- 断言迁移返回该注入错误、版本仍为 **23**；选择表、反向索引和 suppression 列均不存在。比较安装故障触发器之后、执行 Up 之前的全表/schema 快照，失败后逐项完全一致，含 goose 版本表和业务数据。完整性及外键检查通过。
- 移除触发器后，再核对全表/schema 与最初 023 快照一致；重试迁移成功到 **24**，存在 **2** 条选择、反向索引，原唯一记录 suppression 默认 **0**，其余旧业务表数据保持。
- 定向测试首次运行即绿：已有 goose 事务实现通过了新回归；没有伪造失败或声称本次新增了生产修复。

| 命令 | 实际结果 |
|---|---|
| `gofmt -w internal/store/migration_failure_test.go` | 退出 0 |
| `GOMAXPROCS=2 go test -p 1 ./internal/store -run '^TestSelectiveInheritanceMigrationRollsBackOnVersionWriteFailure$' -count=1 -v` | 退出 0，0.040s；触发器确认 DDL/回填已完成后注入错误，回滚与重试断言均通过 |
| `GOMAXPROCS=2 go test -p 1 ./internal/store -count=1` | 退出 0，0.585s；包括故障注入、WAL 恢复和原 store 回归 |
| `GOMAXPROCS=2 go vet ./internal/store` | 退出 0 |
| `git diff --check` | 退出 0 |

仅使用自动清理的临时数据库，顺序执行测试；未运行其他包、未操作真实库或 `.env`，未提交或发布。

## 草稿只读预览与最终依赖（2026-10-08）

本节记录 T011/T014、T038/T042/T043 的部分实现，不将预览完成等同于写入口、安全效果或整个任务完成。

### 测试先行与实现

- `PreviewCategory` 首次因 API/类型尚不存在编译失败（`/tmp/nexus-031-preview-red.log`）；随后实现一致读事务、presence 草稿、内存 overlay、候选与最终字段分离、按字段 ID 归一选择、失源后代裁剪及字段差异。
- 最终编号依赖测试在加入结果类型后实际失败：`lost descendant display dependency = []`。实现编号 issues 后通过；同次清空编号允许，非唯一字段仍可用，未选祖先字段不可用。
- 当前/后代计算依赖测试实际失败：缺少输入却返回空 issues。实现最终上下文依赖闭包，保留非计算输入必须 required 的现有规则；输入与全部继承计算消费者一起撤回时不阻塞。
- 型号和厂商计算字段依赖类别输入的测试分别失败，实际 issues 为空；改为逐个实际型号词汇表验证后通过，类别无资产也检查，不把不同型号的输入拼成一个可满足依赖的并集。
- 无关兄弟类别的旧编号错误曾阻塞本次草稿，新增测试重现后将依赖 issues 限于目标子树。该限制不取消原有同链 key 冲突守卫。
- 子树已有资产时，移动预览原先未报告问题；测试失败后提取只接受 Querier 的 `categoryMoveIssue`，预览与原更新入口共用。parent 未变的改名仍合法。
- 补充父级 omitted/null/非法环、非唯一编号、不同型号同 key 不同 ID、传递计算依赖、环和非法表达式测试首次通过，属于边界回归，不冒充新的行为红灯。

### 实际验证

| 命令 | 结果 |
|---|---|
| `GOMAXPROCS=2 go test -p 1 ./internal/schema -run '^TestInheritancePreview' -count=1` | 最后一次退出 0，0.529s |
| `GOMAXPROCS=2 go test -p 1 ./... > /tmp/nexus-031-preview-move-full.log 2>&1` | 退出 0；部分包使用 Go 缓存 |
| `GOMAXPROCS=2 go vet ./...` | 退出 0 |
| `GOMAXPROCS=2 go test -p 1 -race ./internal/schema -run '^TestInheritancePreview' -count=1` | 退出 0，11.356s |
| `GOMAXPROCS=2 golangci-lint run ./internal/schema/... ./internal/store/...` | 退出 0，日志 `/tmp/nexus-031-schema-lint.log` 为空 |
| `git diff --check` | 退出 0 |

### 当前边界

- 预览没有 HTTP 路由，尚未返回完整资产影响或签发确认凭据；创建/更新尚未收口到同一个 planner。
- 编号和计算最终态校验目前只接入预览，未替代全部旧写路径；T011/T014/T038/T042/T043 保持未勾选。
- 资产效果、确认、唯一历史搜索抑制、陈旧 Prepared 防护及所有消费者收口仍未完成，不能部署。
- 迁移复核发现 T005 仍需补足已归档唯一历史在成功升级后的逐列保留证明；已有回滚与备份测试不能替代。T010 依赖该覆盖，暂不整体勾选。
- 本段未修改 UI、合约或端点，未执行前端门禁、完整覆盖率、全仓库 lint、seed verify、smoke 或性能门禁；没有提交、推送或发布。

## T005 补充：成功升级保留已归档唯一历史（2026-10-08）

迁移复核定位缺口后，新增 `internal/store/migration_unique_history_test.go` 的 `TestSelectiveInheritanceMigrationPreservesArchivedUniqueHistory`；此次只补测试，不改生产或任务勾选。本节补齐上一节提及的已归档唯一历史证明。

- 真实 goose 建到 023，复用旧库测试夹具但不修改共享夹具；仍是一台资产，在其现行唯一记录之外新增两条已归档历史，使用不同旧值及明确的创建/归档时间。
- 升级前保存 `asset_unique_values` 全部六个旧列：`asset_id`、`field_key`、`value`、`archived_at`、`created_at`、`scope_id`，并与三行固定预期交叉核验。保留 NULL 与非 NULL 归档状态的区别，不只比较行数。
- 迁移成功到 024 后，同六列的全部三行逐列相等；另逐行断言一条现行值、两条已归档值的 `search_suppressed` 均为 **0**，普通历史没有被误抑制。
- 新回归首次即绿；没有伪造 red，也没有把此次测试当作生产修复。没有修改其他测试的资产计数。

| 命令 | 实际结果 |
|---|---|
| `gofmt -w internal/store/migration_unique_history_test.go` | 退出 0 |
| `GOMAXPROCS=2 go test -p 1 ./internal/store -run '^TestSelectiveInheritanceMigrationPreservesArchivedUniqueHistory$' -count=1 -v` | 退出 0，0.031s；1 条现行 + 2 条归档历史全部旧列不变、每行 suppression=0 |
| `GOMAXPROCS=2 go test -p 1 ./internal/store -count=1` | 退出 0，0.601s |

仅顺序运行 store 定向与全包测试，全部数据库来自自动清理的临时目录；未读取 `.env`、未接触真实库、未提交或发布。整体任务勾选和交付判断仍由协调会话核对其余要求后处理。

## T014–T016：效果边界与统一类别写事务（2026-10-08）

### 实现与边界

- `schema.AssetEffects` 的 Plan 只接受当前 Querier、前后快照和完整 FieldDelta；准备结果保留 issues、资产 UUID/版本及使用调用方 `*sql.Tx` 的 Apply。schema 不导入 asset。
- 缺少适配器、适配器明确未实现、nil 计划、无 Apply 或成功计划缺少预期资产影响均阻塞。`asset.NewSchemaEffects()` 目前明确返回未就绪 sentinel，**不是 T030 的真实同步实现**，没有注入生产组装。
- 影响数量按实际发生字段差异的类别去重，不按整个祖先子树扩大；目标以外的坏 selection 不再使 categoryDeltas 失败。
- 创建与更新共用 `planCategory`/`saveCategory`。提交在 BEGIN IMMEDIATE 内重新读快照；元数据、选择、后代 path 和效果 Apply 使用同一 tx。新建打印配置和继承选择一次保存，省略选择保留原值，重复 ID 去重，新字段不下传。
- 最终编号只认有效类别字段，同时保留设备侧字段的专用 sentinel 与双语解释。非唯一编号规则及引用守卫未变。
- 需要撤回的写操作目前一律返回 `ErrConfirmationRequired`；尚未签发或接受确认 token。此处是 T033 前的拒绝保护，不是确认流程完成。

### 真实失败与回归

- 效果边界测试先遇到缺少接口的编译红标；补类型后实际失败在“准备结果未被使用”“查询错误未传播”“阻塞 issue 丢失”。接入后通过。
- 另加“有 Apply 但没有资产影响”测试，实际失败为 issues 为空；补完整影响数量检查后通过。
- 创建/更新测试先遇到缺少输入字段的编译红标；补输入类型后实际失败在打印配置未存、非法选择被接受、选择更新无效、未选编号被接受、无确认撤回和无效果资产变更被接受。接入同一 planner 后通过。
- 全量回归最初失败于设备字段编号 sentinel 丢失（schema 与 HTTP）、两处旧自动继承夹具，以及 `TestRecomputeFieldDoesNotRepeatNestedSubtrees` 通过旧移动漏洞造数据。恢复专用拒绝；将继承夹具改为显式选择；重算保留原有计数断言，改用 SQL 构造旧坏数据，不放宽新移动守卫。随后全量通过。
- “空 ID 的 Update 被误当 Create”新增测试实际失败，再添加 Update 的空目标拒绝后通过。
- 子树换父保留 ID/更新原始来源、环/缺父/同链 key 冲突拒绝、选择 INSERT 故障回滚、Apply 写资产版本后故障回滚等补充测试首跑即绿，按回归记录，不伪造红绿。Apply 故障测试确认能读取本事务刚写入的选择，回滚后类别/选择与资产版本均不变。

| 命令 | 实际结果 |
|---|---|
| `GOMAXPROCS=2 go test -p 1 ./internal/schema ./internal/asset -run '^(TestInheritancePreview|TestSchemaEffects)' -count=1` | 退出 0；schema 0.701s，asset 0.078s |
| `GOMAXPROCS=2 go test -p 1 ./internal/schema -run '^TestInheritance(Create|Update)' -count=1` | 退出 0，0.515s |
| `GOMAXPROCS=2 go test -p 1 ./internal/schema -run '^TestInheritanceUpdateEffectFailureRollsBackWholeTransaction$' -count=1` | 退出 0，0.031s |
| `GOMAXPROCS=2 go test -p 1 ./... > /tmp/nexus-031-write-current.log 2>&1` | 退出 0；部分包使用缓存 |
| `GOMAXPROCS=2 go test -p 1 -race ./internal/schema -run '^TestInheritance(Create|Update|Preview)' -count=1` | 退出 0，26.997s |
| `GOMAXPROCS=2 go vet ./...` | 退出 0 |
| `GOMAXPROCS=2 golangci-lint run ./internal/schema/... ./internal/asset/... ./internal/store/... ./internal/i18n/...` | 退出 0，0 issues |
| `git diff --check` | 退出 0 |

T014–T016 的过渡边界已验证；完整效果、确认、Prepared 防陈旧、所有绑定写入口与消费者仍未完成，**不能部署**。T005 原始“缺表/缺回填”的预期失败记录仍未补齐，T005/T010 不勾选。迁移历史 suppression=0 是存储层证据，不代替普通搜索与 exactMatch 实测。

本节未修改 UI 或端点，未运行前端门禁、最终覆盖率、全仓库 lint、seed verify、smoke 与性能门禁。`after_implement` 仅配置可选 git commit hook，未执行提交、推送、tag 或发布。

## T012/T017/T018：完整 HTTP 草稿与只读预览（2026-10-08）

- 新增两个 POST preview 路由，仍处于认证边界内，读权限开放；创建和更新保留 `schema.manage` 守卫。四个入口共用 presence 解码，父级 omitted/null/ID 与继承选择 omitted/[]/null 分开处理，数组 null 元素也明确拒绝。
- 创建打印配置、选择、编号一次提交，更新省略选择不丢失。预览候选、影响、issues 独立分页，计数由完整影响得到；fields 不混入候选。创建预览允许不完整名称，写入口仍保留必填要求。
- 继承非法候选和父级成环返回带字段定位的 400；不存在返回标准 404；可修正依赖返回 200+issues。issues 使用 `userText`；新增 null/非法候选/环的中英文说明，编号错误说明改为最终有效字段。
- 未实现资产效果与缺少确认分别映射为 409 `schema_effects_unavailable` / `confirmation_required`，不再落为 500；编号错误定位到 `display_key`。当前仍不签发或接受确认 token，不能将空 token 响应视为 T033 完成。

### 测试先行与实际结果

- schema 消息测试初次使用了不适用于 i18n.Wrap 的测试接口，属于测试准备错误；改用现有 `i18n.Text` 后实际失败为 null/非法 ID/环均无针对性解释，再增加目录消息并接入，通过。
- HTTP 测试初次误把 `listFields` 的 map 结果当结构体，属于测试编译错误；修正后 `/tmp/nexus-031-http-red.log` 记录实际红灯：完整创建 422、预览路由 404、创建/更新 null 被接受、父级环 500。实现共享解码和预览后通过。
- 写拒绝测试另行实际复现 unavailable/confirmation 500，以及编号缺少字段定位；补映射后通过。
- 扩展的三级来源、分页外完整撤回计数和审计测试首次即绿，作为补充回归记录。只读与失败用真实临时库所有非 SQLite 内部表的数据快照比较，包含 audit、资产、索引和元数据；成功创建/更新分别检查一条类别审计。

| 命令 | 实际结果 |
|---|---|
| `GOMAXPROCS=2 go test -p 1 ./internal/schema ./internal/i18n -run '^(TestInheritanceDraftErrors|TestCatalog|TestFormat)' -count=1` | 退出 0 |
| `GOMAXPROCS=2 go test -p 1 ./internal/httpapi -run '^TestInheritanceHTTP' -count=1` | 退出 0，扩展后 0.650s |
| `GOMAXPROCS=2 go test -p 1 ./... > /tmp/nexus-031-http-current.log 2>&1` | 退出 0；部分包缓存 |
| `GOMAXPROCS=2 go vet ./...` | 退出 0 |
| `GOMAXPROCS=2 golangci-lint run ./internal/httpapi/... ./internal/schema/... ./internal/i18n/...` | 退出 0，0 issues |
| `git diff --check` | 退出 0 |

前端阶段另行进行，完整效果/确认/消费者与最终门禁仍待完成。

### T022：合约与 smoke 同步

- 两份全量 OpenAPI 保留既有端点，补齐完整草稿、两个 preview、三组分页、字段与 issues 结构、认证和写权限边界、400/404/422/409。明确当前 token 恒空、撤回仍拒绝，不声明完整确认或 impact_stale。
- smoke 在自身临时容器数据库创建真实父类别/字段/子类别，验证新建打印配置、两个 preview 的匿名 401、null 400、缺父 404、成功投影、分页、业务 issues、422 拒绝和伪造 token 不能授权撤回。嵌入 Python 标准库检查 JSON，无第三方 Python 依赖。
- 代理报告 `bash -n deploy/smoke.sh`、嵌入 Python 语法检查、embedded contract 测试及三文件 diff-check 通过；未运行 Docker、未读取 `.env`、未提交。可选 PyYAML 解析未运行（未安装）。
- 主会话审阅三文件差异后实际执行 `cmp specs/001-asset-ledger-demo/contracts/openapi.yaml internal/httpapi/docs/openapi.yaml && bash -n deploy/smoke.sh && GOMAXPROCS=2 go test -p 1 ./internal/httpapi -run '^(TestInheritanceHTTP|TestEmbeddedContractMatchesTheSpec)' -count=1 && git diff --check`，退出 0，HTTP 测试 0.664s。
- **Docker smoke 未执行**；脚本语法/结构验证与真实容器端到端验证不同，后者留待 T068。

### T011 覆盖复核与 HTTP race 回归

- 对照 `inheritance_test.go` 和 `inheritance_write_test.go` 逐项核对创建/更新 presence、根选择、跨层与设备候选、同 key 不同 ID、自身绑定排除、重复 ID、新字段不下传；此前预览 API 编译红灯及依赖行为红灯、写入行为红灯已在各阶段记录，不重新制造历史。
- `GOMAXPROCS=2 go test -p 1 ./internal/schema -run '^(TestInheritance|TestNewChild|TestStoreFieldReaders)' -count=1` 退出 0，1.359s。
- `GOMAXPROCS=2 go test -p 1 -race ./internal/httpapi -run '^TestInheritanceHTTP' -count=1` 退出 0，11.233s。
- 按实际覆盖勾选 T011/T012/T017/T018/T022；不把当前的拒绝保护记为完整恢复或确认能力。

## T032：搜索读取排除抑制的唯一记录（2026-10-08）

此项只依赖已存在的 024 suppression 列，独立先完成读取侧；不放开撤回写入，不表示 T030/T031 已经会正确生成抑制状态。

- 新增 `internal/asset/query_inheritance_test.go`，真实临时库中建立资产，再用测试事务构造撤回后的索引状态，分别验证 live/history 唯一记录的 suppression。损坏的 live suppressed 也不能命中；这不是合法写入场景或对帐豁免。
- 首次 `GOMAXPROCS=2 go test -p 1 ./internal/asset -run '^TestInheritanceSearch' -count=1` 退出 1，日志 `/tmp/nexus-031-search-red.log`：被抑制值仍通过原值、规范化 MAC、子串命中；独立非唯一有效字段同词命中时错误产生 exact jump。
- 普通搜索唯一子查询，以及 exactMatch 的现行/历史两条 probe 均加入 `search_suppressed = 0`。LIKE 两分支用括号整体受 suppression 限制。ValueHistory 不过滤历史，UUID 身份查询不受影响，普通改号历史继续可查。
- 定向测试转绿 0.291s；`GOMAXPROCS=2 go test -p 1 ./... > /tmp/nexus-031-search-full.log 2>&1`、asset vet、asset golangci-lint（0 issues）及 `git diff --check` 均退出 0。Go 全量部分包使用缓存。
- 撤回事务生成 suppression、恢复新行不复活旧历史、唯一槽释放以及端到端确认仍由后续 T023/T030/T031/T033 验证，不能用本组 SQL 夹具冒充完整撤回成功。

## T013/T019–T021：类别完整草稿与继承 DOM（2026-10-08）

- 创建/编辑共用 `useCategoryDraft`；未初始化与明确空选择分开，候选分页不丢页外选择。换父使用当前未保存选择与新父全部候选分页求 ID 交集，不按 key 冒认；迟到响应不覆盖新草稿。
- 失败保留草稿和已有候选表，禁用保存并提供重试。编号只由最终 fields 提供，父级、继承、编号与打印配置一次提交。详情保持只读、直接绑定继续指路字段编辑器；无权限禁用并解释。
- 双语、键盘 Checkbox、来源/类型/必填、候选/影响/issues 分页、FieldError 与 toast 有真实 DOM 覆盖。分页器重复控件 ID 的回归先失败，再用 `useId` 修复。
- 前端代理先运行 12 条新增 DOM，全部预期失败；另有失败后候选表被清空及多个分页器标签冲突的独立红灯。日志：`/tmp/031-web-red.log`、`/tmp/031-web-preserve-red.log`、`/tmp/031-web-pagination-red.log`。定向最终 43 条通过，全量当时 62 文件/544 测试通过。
- 该阶段 `tsc --noEmit`、lint、build 通过，入口 gzip 215.18 kB，类别 chunk gzip 6.01 kB。日志为 `/tmp/031-web-delivery-{full,tsc,lint,build}.log`。存在非失败诊断：Node localStorage 实验提示、既有 React key/render 警告和 Vite 原始 chunk 大小提示；不把这些日志描述为零告警。
- 主会话审阅草稿 hook、编辑器和继承区实现及 DOM 场景。未做真实浏览器、窄屏、焦点与性能走查；T064 未完成。当前 requires_confirmation 仍禁存，未实现或自动重放确认 token。

## T027–T029：Prepared 指纹及导入整批防陈旧（2026-10-08）

### 真实红灯与修复

- `internal/asset/prepared_schema_test.go` 用真实 SQLite 验证类别名称、编号、必填规则、计算规则、继承撤回五类变化 × 新建/编辑。Prepare 后在传入的未提交写事务内改 schema，再 Persist；旧实现十个子场景都接受陈旧准备，日志 `/tmp/nexus-031-prepared-red.log`。失败前后比较 assets、unique、search、transfers 的所有列，不只计数。
- Prepare 的实际字段、型号默认值、计算上下文与规范指纹现在来自同一个只读快照。Persist 首步从调用者 tx 加载 schema 并比较指纹；新建同样受保护，缺指纹或类别/型号消失也拒绝。无关祖先名称/其它型号变化不误伤；指纹不依赖全局时间戳或其它型号可达范围。
- `SchemaSnapshot.AssetSchema` 覆盖字段身份/规则/原始来源、当前类别上下文及编号、实际型号厂商上下文与默认值；返回值深复制。schema 代理报告相关/无关变化及复制隔离测试、schema 全包和定向 race、vet/lint 通过。overlay 保留新加入的不可变型号/厂商绑定映射。
- 导入测试占用唯一写连接，在 WaitCount 确认批次已准备后只修改第二行型号名称，再放行写事务。旧实现 preview 返回成功，commit 留下 2 assets、4 unique、4 search、2 transfers，日志 `/tmp/nexus-031-import-stale-red.log`。
- 导入改为事务外统一快照、名称解析与全部 Prepare，事务内一次 `BeginPersistence` 并在首条写入前整批 Check。stale 是致命批次错误，不作为单行普通校验收集、不自动重新准备。500 次 Check 不增加 schema SQL；该性能检查及缺指纹检查是实现后首次即绿的补充回归，不冒称独立红灯。
- HTTP sentinel（包括包装错误）统一为 409 `schema_stale`，中英目录输出。FailErr 测试先红为 500；真实导入两入口 × 两语言先红为 422，之后仅 sentinel 分流至统一错误边界。新建/编辑 HTTP 竞争因底层保护已接入首次即绿，记录为补充集成回归。路由为单数 `/api/import/preview`、`/api/import/commit`。
- 前端两条真实 DOM 先红：旧导入预览仍可确认、资产编辑器在 stale 后关闭；日志 `/tmp/031-stale-red.log`（2 失败/39 通过）。最小修复后定向 41/41 通过：导入保留同一文件和类别但清除旧预览；资产保留备注/动态字段草稿，禁存并提供手动刷新字段，刷新失败仍可重试，不自动重试写入。

### 实际验证

| 命令/范围 | 实际结果 |
|---|---|
| `GOMAXPROCS=2 go test -p 1 ./internal/asset ./internal/importer -count=1` | 退出 0，asset 5.383s、importer 1.415s |
| 上述两包 `go vet`、`golangci-lint run` | 退出 0，lint 0 issues |
| `GOMAXPROCS=2 go test -p 1 -race ./internal/asset ./internal/importer -run 'TestPersist\|TestBatchPersistenceSchema\|TestImportRejectsSchemaChanged' -count=3` | 退出 0，asset 42.649s、importer 7.879s；`/tmp/nexus-031-prepared-race.log` |
| `GOMAXPROCS=2 go test -p 1 ./... -count=1` | 退出 0，各测试包均通过；`/tmp/nexus-031-stale-full.log` |
| HTTP+i18n `-count=1`、HTTP stale `-race -count=5` | 代理验证通过；`/tmp/nexus-031-http-i18n-final.log`、`/tmp/nexus-031-http-stale-race.log` |
| `npx vitest run --maxWorkers=4` | 62 文件、546 测试通过，47.03s；`/tmp/031-stale-full.log`，仍含既有非失败 React 警告 |
| `npx tsc --noEmit`、`npm run lint` | 代理验证退出 0；`/tmp/031-stale-{tsc,lint}.log` |
| `git diff --check` | 主会话退出 0 |

- importer 屏障清理最初漏检查 Close 错误，lint 报错；补检查后因主动释放再 defer Close 出现 `sql.ErrConnDone`。最终仅忽略该预期重复关闭 sentinel，其它错误仍报；上述全包/race 结果是修复后实际运行。
- 最新 stale 前端改动后已运行 `npm --prefix web run build`，日志 `/tmp/nexus-031-stale-build.log` 确认 tsc 与 Vite 成功，构建 4.74s；仍有原始 chunk 大小提示。合约/smoke 同步另行记录；静态脚本检查不等于容器 smoke。
- `Persistence` 只用于不再修改元数据的资产写事务；不把 Prepared 的公开字段说成不可篡改凭据。独立 `writeRecomputed` 路径保护仍由 T044 完成。
- 本阶段可勾 T027–T029；真实撤回/恢复、索引抑制写入、HMAC 确认、绑定/解绑收口、全部消费者与最终门禁仍未完成，**不能部署**。

## T031 局部：批量唯一 claims 写入基础（2026-10-08）

- 新增 `internal/asset/schema_claims.go` 与真实 SQLite 测试。输入是每个资产的完整最终 claims 与真正失效的 key；先统一释放所有变化占用，再插入最终值，允许跨资产交换。未变 claims 保持原行。
- 撤回将该 key 全部历史与当前记录归档并抑制搜索；恢复只插入新的未抑制 live 行，不复活旧历史。仍有效字段的来源变化只归档旧 scope，不抑制历史。
- 可编译的 fail-closed 占位实现下，交换、撤回/恢复、来源变化三条测试真实失败，日志 `/tmp/nexus-031-schema-claims-red.log`。API 未定义时的编译错误不算行为红灯。
- 四个顶层测试覆盖交换、历史抑制/恢复/幂等、来源变化和完整事务回滚。回滚测试在占位实现下曾首次即绿，随后收紧为明确到达 UNIQUE constraint 或注入 INSERT trigger 故障；最终验证释放、抑制和同事务类别改名全部回滚。
- 定向 `go test -p 1 ./internal/asset -run '^TestSchemaClaims' -count=1` 转绿，0.363s；收紧断言后运行 `GOMAXPROCS=2 go test -p 1 ./... -count=1`，全部通过，日志 `/tmp/nexus-031-claims-full.log`（asset 5.621s、schema 4.572s、HTTP 14.261s）。全量 `go vet ./...`、asset `golangci-lint run`（0 issues）及 `git diff --check` 均退出 0。
- 此 helper 不修改 assets/search/transfers，事务及最终 claims 校验由调用者负责。本阶段结束时尚未接入真实 SchemaEffects；后续撤回切片见下节。**T023/T030/T031 保持未勾选**。公开撤回仍要求尚未接通的确认凭据，不能部署。

## T023/T030 局部：撤回资产效果与事务回滚（2026-10-08）

- `SchemaEffects.Plan` 现在支持仅撤回且其余有效字段定义/来源不变的切片。通过调用者 Querier 按实际变化类别一次扫描、按资产 ID 排序去重；返回 UUID/版本和同事务 Apply。新增、恢复与来源变化仍 fail closed，生产组装仍未注入。
- Plan 只读；Apply 对每个资产检查原版本并只递增一次，完全不重写 raw attrs，不创建流转，调用批量 claims writer 并重建最终搜索值。公开类别撤回的 confirmation 守卫未更改。
- `TestSchemaEffectsWithdrawalPreservesAttrsAndUpdatesIndexesOnce` 在 stub 下真实失败：`schema asset effects unavailable`，日志 `/tmp/nexus-031-effects-withdrawal-red.log`。实现后发现测试误把 Get 的有效 attrs 投影当成 raw attrs，改用原始 SQL 读取验证保留，未改生产读取语义；随后通过。
- 搜索 INSERT trigger 故障回归首次即绿，明确到达 `injected search failure` 后比较四张资产表全列不变、继承选择恢复；不把首次绿补测称为 TDD 红灯。追加原版本变化后 Apply 返回 `ErrVersionConflict` 的回归亦首次即绿。
- 第一轮后台全 Go 测试全部通过，随后的 vet 碰到主会话编辑测试的中间态（`strings imported and not used`）退出 1；编辑完成后重跑定向测试、全量 vet 和 asset lint 均通过。后续验证改为在文件稳定后前台运行。
- 稳定版本 `GOMAXPROCS=2 go test -p 1 ./... -count=1` 全部通过（`/tmp/nexus-031-withdrawal-final-full.log`）；`go test -p 1 -race ./internal/asset -run '^(TestSchemaEffects|TestSchemaClaims)' -count=3` 通过 27.930s（`/tmp/nexus-031-withdrawal-race.log`）；全量 vet、asset lint（0 issues）、diff-check 通过。上述全量/race 在最后追加版本冲突补测之前；该补测追加后的效果定向测试通过 0.293s、asset lint 0 issues。
- 这是直接 effects 边界测试，测试事务构造前后快照，不是带确认凭据的公开端到端撤回。本节结束时尚缺恢复验证、必要计算、最终 claims 冲突预览、来源变更、真实注入及 HMAC 确认；后续切片见下节，相关任务不整体勾选，**不能部署**。

## T023/T030/T031 局部：静态恢复、必要计算及来源范围（2026-10-08）

- 新增 `schema_asset_plan.go`、`schema_claim_check.go`、`schema_compute.go`：逐资产前后字段身份比较；恢复的非空静态值复用当前类型/格式/范围校验及规范化，存量必填缺值不造值；仅重算新增/恢复计算节点与变化输入的前向依赖闭包，使用最终有效输入，不重算无关节点。
- Plan 将所有受影响资产最终 claims 与未变化资产 live claims 比较，不逐资产对仍未释放的旧占用判冲突。issues 保留字段身份、资产 UUID 与冲突资产 UUID，消息使用既有 i18n；有 issues 的计划不提供 Apply。HTTP issue 投影尚待相应任务接入，不把领域结构误称为已上线合约。
- 来源变化调整最终 scope，版本增加一次，旧历史归档但不 suppressed；撤回继续 suppress 全历史，恢复插入新 unsuppressed 行。raw attrs 仅写入规范化/必要计算的变化，归档键保留，流转不变。
- 静态恢复测试先出现合法/缺值真实失败；非法/冲突测试最初被提前 unavailable 错误假绿，补 `checkedIssue` 明确断言抵达结构化 issue 后，四个子场景均真实红，日志 `/tmp/nexus-031-effects-restore-red.log`。实现后四项转绿；范围非法、MAC 规范化为首次即绿的补充回归。
- 计算链测试的初始夹具漏标表达式依赖必填，被已有定义守卫拒绝；修正夹具后链恢复和缺输入两项真实失败于 unavailable（`/tmp/nexus-031-effects-compute-red.log`）。实现后 `10 → 16 → B-16`，无关旧计算值 KEEP 不重算，缺输入产生 computation_failed 且零资产写入。开发中误用 Model.Vendor 编译失败，改用真实 VendorName 后通过，不将编译失败记作行为红灯。
- 来源迁移测试真实失败于 unavailable（`/tmp/nexus-031-effects-source-red.log`），实现后同 ID 字段从根来源切换为直接绑定，旧 scope 历史保留可搜，新 scope live 成立。此为 effects 边界，不代表公开移动守卫或合法交换全链已验收。
- asset 全包曾有 `TestSchemaEffectsPreviewBlocksExistingAssetChanges` 失败，因为它断言 T015 临时 unavailable，而静态新增已可规划；改为验证同一真实预览只读且就绪，保留无适配器和非法输入的 fail-closed 覆盖。
- 最新 `GOMAXPROCS=2 go test -p 1 ./... -count=1` 全通过（`/tmp/nexus-031-effects-full.log`，asset 6.446s、schema 4.573s、HTTP 14.134s）；effects/claims `-race -count=3` 通过 61.165s（`/tmp/nexus-031-effects-race.log`）；全量 vet、asset+schema lint（0 issues）与 diff-check 通过。
- 补跑全仓 `GOMAXPROCS=2 golangci-lint run ./...` 退出 0（`/tmp/nexus-031-effects-repo-lint.log`）。当前覆盖率采样为 asset 82.4%、schema 83.8%、compute 88.1%、cmd/nexus 30.2%，日志 `/tmp/nexus-031-effects-coverage.log`；verifyUniqueValues 44.0%、verifyKeyConflicts 46.2%，因此不能宣称 verify 核心及最终覆盖率门禁已通过。
- 新增 `schema_integration_test.go` 通过真实 `PreviewCategory` 内存 overlay 与 `UpdateCategory` 验证恢复归档静态值：预览不写资产/选择，保存同步 claim/version；随后公开无确认撤回返回 ErrConfirmationRequired 且资产/索引/选择保持。这是实现后首次即绿的集成补测，不冒称独立红灯。追加后全量 `go test -p 1 ./... -count=1`、全量 vet、全仓 lint（0 issues）和 diff-check 再次通过，日志 `/tmp/nexus-031-effects-integration-full.log`。
- 仍未注入生产服务，未接 HMAC 确认或全部绑定入口，公开撤回仍拒绝。相同 schema 的编译缓存/批量性能、完整最终交换/回滚矩阵与所有消费者仍待后续；T023/T030/T031 不整体勾选，**不能部署**。

## 资产效果独立复核与覆盖补齐（2026-10-08）

- 独立只读复核未发现高置信新增正确性缺陷；复核者实际运行 effects/claims 定向测试通过。该结论仅覆盖资产效果规划和写入边界，不代表生产接线、确认链或全部消费者已完成。
- `TestSchemaEffectsCategoryAdditionFailureRollsBackMetadata` 使用真实类别 Update 入口和持久触发器注入搜索 INSERT 故障，明确检查错误含注入标识；类别名称、选择、四张资产表完整恢复。它验证元数据与 Apply 的实际事务编排，而非只测试直接调用 effects。
- `TestSchemaEffectsRejectsBatchFinalClaimCollision` 覆盖两台受影响资产恢复不同文本形式的同一 MAC，规范化后的最终 claims 互撞。真实 Preview 给出两个 UUID 的冲突且不写入，Update 拒绝并保持类别、选择、资产与索引不变；若遗漏批内最终占用登记，此测试会失败。
- 计算测试新增 `existing_chain` 边界夹具：计算链已有效，仅恢复输入也必须依次得到 `16`、`B-16`，无关计算仍为 `KEEP`。起始缺依赖状态用 SQL 明确构造，不声称公开 schema API 允许创建不完整依赖集；若只重算新增计算节点而不传播输入变化，此测试会失败。
- 上述三项均是已有实现的首次即绿补充回归，没有修改生产逻辑，不冒称新的 TDD 红灯。定向运行退出 0（0.438s）；完整 Go（`/tmp/nexus-031-effects-review-full.log`）、effects/claims 三轮 race（75.020s，`/tmp/nexus-031-effects-review-race.log`）、全量 vet、全仓 lint（0 issues）与 diff-check 均通过。
- 随后新增 `TestSchemaEffectsFinalScopeExchange`：两个根类别共享字段 ID，各自子类资产持有同值，边界事务交换两子类来源；完整 Plan + Apply 接受合法最终 claims，旧历史不抑制、新 scope 正确、version 各加一、搜索与事件不变。首次即绿 0.084s；明确不放宽公开类别移动的存量资产限制。

## T030 局部：生产与完整测试组装注入（2026-10-08）

- `TestSetupAppliesInheritedFieldEffects` 直接调用真实 `setup`，只使用 t.TempDir 数据库和显式测试环境变量，EnvFileVar 指向不存在的临时路径，不读取仓库 `.env`。旧生产组装下真实失败于 `schema asset effects unavailable`（`/tmp/nexus-031-assembly-red.log`），并非夹具或编译错误。
- `cmd/nexus/main.go` 注入 `schema.NewWithEffects(db, asset.NewSchemaEffects())` 后，该测试通过，验证存量归档值恢复、version 与 live claim 的原始 scope，同时保持无确认撤回拒绝。同步 cmd/asset/importer/transfer/HTTP 五套完整服务夹具；schema-only 解析和缺适配器拒绝测试不强行引入 asset 依赖。
- 首次全量发现 `TestInheritanceHTTPWriteRefusalsAreLocalizedAndAtomic` 仍期待 T015 过渡 unavailable：实际撤回已到达 confirmation_required，新增已成功，继而污染同夹具的后续 display 子场景。更新为最终安全预期：中英撤回 confirmation_required、非法编号与候选仍拒绝且零写入，新增最后单独验证成功及版本递增；未删掉失败安全断言。
- 更新后完整 `GOMAXPROCS=2 go test -p 1 ./... -count=1` 退出 0（`/tmp/nexus-031-assembly-full.log`：asset 6.783s、schema 4.554s、HTTP 14.093s）；全量 vet、全仓 lint（0 issues）、diff-check 通过。
- 随后 effects/claims/setup 三轮 race 中，setup 通过，scope 交换测试两次失败于按 rowid 比较搜索行（`/tmp/nexus-031-assembly-race.log`）。成功重建的行顺序取决于资产 UUID 排序，并不是保持旧 rowid 的业务约束；将成功断言改为两条准确的资产 ID/字段/value 索引及总数，事件仍全列不变。失败回滚测试继续完整原样比较，不放松其原子性断言。修正后重新运行全部通过：effects/claims/setup 三轮 race（asset 78.281s、cmd/nexus 4.290s，`/tmp/nexus-031-assembly-race-final.log`）、全量 Go（`/tmp/nexus-031-assembly-final-full.log`）、全量 vet、全仓 lint（0 issues）、gofmt（无输出）与 diff-check。另跑两份 OpenAPI 字节一致、smoke bash 语法和 HTTP 文档合约测试通过；未实际运行容器 smoke。
- 接线不是部署授权：HMAC、直接解绑/整组绑定收口、全部消费者/verify、编译缓存/分批扫描及万级性能仍未完成。T023/T030/T031 暂不整体勾选，**不能部署**。
