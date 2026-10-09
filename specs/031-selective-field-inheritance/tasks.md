# 实施任务：类别字段可选继承

**输入**：本目录 `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/inheritance.md`、`quickstart.md`。

**状态（2026-10-08）**：核心实施已收口：正向选择、完整确认、绑定/解绑、事务效果、消费者、重算与对帐已接入。页外唯一冲突的500错误分类已真红→修复为本地化422；修复后Go全量/覆盖率/静态检查、新二进制seed10000/verify、Docker重建和真实smoke均通过。前端65文件569测试及构建通过，真实消费者DOM已补齐。**69/69项完成，本轮实施与验收已收尾，未推送或发布**：T005缺表/缺回填的当前隔离mutation负向验证已失败→还原通过，明确不冒称历史红灯；T010迁移/WAL恢复前置闭环。T062最终生产bundle与同一真实临时库贯穿UI/HTTP/verify通过；T064真实后端5次禁缓存业务可交互中位226ms、p95/max451ms（非Lighthouse TTI），中英/键盘/窄屏/故障矩阵已有实际记录。T069合约、文件、安全与七条门禁汇总完成。长事务与测量环境限制已登记plan，不是发布豁免。实际命令和历史失败见 `verification.md` 及各专项。

**测试要求**：章程要求核心管线失败分支、真实 SQLite HTTP 集成测试及真实 DOM 交互测试。每项行为先写测试并运行确认预期失败，再实现、定向验证及相关回归；测试准备错误不算预期失败。已存在测试只需保持绿色，新增测试不能靠修改旧断言掩盖问题。

**格式**：`- [ ] Tnnn [P?] [USn?] 描述与路径`。`[P]` 只表示同阶段且明确依赖已完成后可并行、修改不同文件；不是启动多代理或同时运行高负载测试的授权。本文所有路径相对仓库根；标注“新增”的文件为拟实现落点。

## 阶段 1：准备与可重复验证

**目标**：固定规则、测试基础与证据位置，不改变业务行为。

- [X] T001 核对 `docs/rules/schema.md`、`domain.md`、`expr.md`、`web-tables.md`、`web-forms.md`、`printing.md` 与本轮替代条款；在 `specs/031-selective-field-inheritance/verification.md`（新增）记录基线分支、环境、当前迁移最高编号、已有失败及后续命令/结果；不得读取或记录 `.env` 密钥。
- [X] T002 在 `internal/schema/store_test.go`、`internal/httpapi/categories_test.go` 和 `web/tests/categories.test.tsx` 的现有夹具基础上确定真实库与 DOM 复用方式；将三层、多分支、混合型号、同 key 不同字段 ID、归档值的测试数据构造放入各包测试辅助文件，不把测试专用开关放入生产类型。

## 阶段 2：阻塞基础——一致读取边界

**目标**：先建立可供预览、提交与派生处理复用的读取抽象；此阶段不暴露未受保护的写 API。

- [X] T003 在 `internal/store/tx_test.go`（新增）先写一致读快照、只读事务的底层写入被 SQLite 拒绝、错误回滚与写事务读取自身更新的测试；使用确定性同步而非 sleep，运行确认新增能力的预期失败。
- [X] T004 在 `internal/store/tx.go` 增加只读 Querier（`QueryContext`/`QueryRowContext`）和一致只读事务封装，供当前 `*sql.Tx` 复用；写事务继续由调用方持有 `*sql.Tx`，不把 `ExecContext` 暴露给快照读取器；保持 WAL、BEGIN IMMEDIATE、单写连接及错误链；验证 T003，不允许预览借写后回滚伪装只读。

**检查点**：读取设施可在真实 SQLite 独立测试；所有用户故事依赖 T004。

## 阶段 3：用户故事 2——升级保持现有结果（P1）

**排序理由**：五个故事均为 P1；US2 提供新解析器所需表及旧库兼容证明，因此先于 US1。故事编号仍与 spec 保持一致。

**独立验收**：从迁移 023 的旧结构建库，经本轮迁移后，三级及多分支每层字段 ID、顺序、来源、规则、编号和唯一 scope 相等；直接绑定、raw attrs、事件不变，失败无半迁移。

### 测试先行

- [X] T005 [P] [US2] 在 `internal/store/selective_field_inheritance_test.go`（新增）构造真实旧结构夹具，覆盖三级、多分支、多排序、空树、唯一历史以及迁移失败回滚；保存迁移前结果而非用新 API 伪造旧数据，运行缺表/缺回填的预期失败。
- [X] T006 [P] [US2] 在 `internal/schema/snapshot_test.go`（新增）覆盖批量加载、选择解析、原始来源、稳定顺序、设备字段隔离、事务内数据可见性与缓存复用；旧行为对照使用固定预期，运行预期失败。

### 实现

- [X] T007 [US2] 再确认编号空闲后新增 `migrations/024_selective_field_inheritance.sql`：选择表、field_id 反向索引、唯一历史 search_suppressed 列与约束；事务内按旧严格祖先集合去重回填，不改直接绑定/attrs/事件/scope；明确拒绝不安全 Down；同步 `internal/store/migrate_test.go` 的迁移列表及 Down 测试，使安全拒绝不被当成可逆迁移失败，使用迁移至 023 的独立夹具而非从最新版跨拒绝边界降级；验证 T005。
- [X] T008 [US2] 在 `internal/schema/snapshot.go`（新增）、`resolve.go`、`binding.go` 实现同一 Querier 批量加载类别、定义、绑定、选择及型号/厂商；根到叶按选择解析，缓存类别/型号集合，保留 EffectiveFields、FieldsForAsset、EveryPossibleField 的不同语义及原始来源，验证 T006。
- [X] T009 [US2] 在 `internal/schema/inherit_test.go`、`resolve_test.go`、`store_test.go` 增加迁移后旧类别新增父字段也不自动下传的集成回归；将原来依赖新建即自动继承的测试改为显式选择的夹具，保留旧库等价断言而非删除回归场景。
- [X] T010 [US2] 在 `specs/031-selective-field-inheritance/quickstart.md` 细化并实测临时旧库升级、备份恢复及不安全降级拒绝，结果写入 `verification.md`；确认 WAL 一致性备份、升级后新写入保全说明及 T005–T009 全部通过。

**检查点**：旧库迁移及新解析器独立通过；尚不能部署，保存与撤回安全链仍未完成。

## 阶段 4：用户故事 1——逐项选择父类字段（P1）

**独立验收**：三层类别中只继承明确选择的直接父类有效字段；自身绑定不混入候选、来源不漂移；新建默认空、取消零写入、一次保存父级/选择/编号/打印配置。

### 测试先行

- [X] T011 [P] [US1] 在 `internal/schema/inheritance_test.go`（新增）覆盖创建/更新省略、[]、null、根选择、跨层/设备非法候选、同 key 不同 ID、自身绑定排除、重复 ID 规范化与新字段不下传，运行预期失败。
- [X] T012 [P] [US1] 在 `internal/httpapi/inheritance_test.go`（新增）覆盖 POST/PATCH 类别、两种 preview 的成功响应及 400/404、父级三态、创建打印配置、读取开放/写 schema.manage、候选分页与预览零数据/审计写入，使用真实临时 SQLite，运行预期失败。
- [X] T013 [P] [US1] 在 `web/tests/categoryInheritance.test.tsx`（新增）用 getByRole/userEvent 覆盖新建默认空、加载现选、勾选取消、统一保存、页外选择保留、来源/必填/类型展示、最终编号候选、加载错误不当空集和无权限禁用，运行预期失败。

### 实现

- [X] T014 [US1] 在 `internal/schema/inheritance.go`、`change.go`（新增）定义 presence 草稿、内存 overlay、规范化选择与 FieldDelta；组合前后快照、业务 issues 和一致只读预览，显式非法选择报错，候选与最终 fields 分离；落元数据私有函数接受调用者 tx，不嵌套事务。
- [X] T015 [US1] 在 `internal/schema/change.go` 定义资产效果窄接口并在 `internal/asset/schema_effects.go`（新增）建立适配边界；没有真实效果实现时对有资产影响的变更明确失败，不默许 no-op；schema 不 import asset，完整效果实现由 T030 接续。
- [X] T016 [US1] 在 `internal/schema/category_store.go` 收口创建与更新为同一事务规划入口，保留省略含义、根规则、直接绑定语义和旧成功形状；先支持无资产影响的合法变更，对尚未支持的有影响变更 fail closed，验证 T011。
- [X] T017 [US1] 在 `internal/httpapi/handlers_metadata.go`、`server.go` 解码完整草稿并接入创建/编辑预览和统一写入口；正确区分 omitted/null，处理 query 分页，语法错误 400、对象不存在 404、可修正业务依赖 200+issues；写守卫不依赖预览权限，验证 T012。
- [X] T018 [US1] 在 `internal/i18n/keys.go`、`catalog.go` 增加候选非法、依赖、草稿校验等双语消息；HTTP 经 userText 渲染一次，issues 同样本地化，参数顺序一致；运行目录覆盖和中英请求集成测试。
- [X] T019 [US1] 在 `web/src/lib/types.ts`、`metaTypes.ts`、`features/categories/useCategoryDraft.ts`（新增）定义 preview/impact 类型与完整草稿状态：区分未加载/空选择，分页保留全选集，换父只留候选 ID 交集，忽略迟到响应，不用错误响应清空草稿。
- [X] T020 [US1] 在 `web/src/features/categories/CategoryEditor.tsx`、`routes/Categories.tsx` 接入共用草稿逻辑与 shadcn Checkbox/Field 继承区，最终 fields 驱动编号候选，打印配置一起提交；自身直接绑定仅指路、CategoryDetail 保持只读；无管理权限禁用并说明。
- [X] T021 [US1] 在 `web/src/i18n/zh.ts`、`en.ts` 补齐继承区、来源、分页、空/错/加载/提交状态文案，使用现有 Alert/Empty/Skeleton/Spinner、toast 与 FieldError；完成 T013 并记录中文/英文和键盘交互验证，不引入新自定义基础组件。
- [X] T022 [US1] 在 `specs/001-asset-ledger-demo/contracts/openapi.yaml`、`internal/httpapi/docs/openapi.yaml`、`deploy/smoke.sh` 同步类别草稿及两个 preview 路由，加入身份边界和合法响应结构验证；运行 `internal/httpapi/docs_contract_test.go` 与相关集成测试。

**检查点**：无存量影响的选择流程可演示并独立验收；有资产影响路径必须保持拒绝，直到 US3 完成。不能将此阶段标作完整可发布 MVP。

## 阶段 5：用户故事 3——安全撤回与恢复（P1）

**独立验收**：向下撤回已选字段并保留 raw attrs，释放唯一槽和搜索命中；主动恢复合法旧值，冲突/取消/stale/依赖错误全量回滚；直接解绑无法绕过。

### 测试先行

- [X] T023 [P] [US3] 在 `internal/asset/schema_effects_test.go`（新增）覆盖撤回 raw attrs 保留、资产去重与版本、当前/历史唯一搜索抑制、普通改号历史保留、合法旧值恢复、格式/范围/唯一冲突恢复、来源变化不误抑制，失败比较类别/选择/资产/索引/事件完整快照。
- [X] T024 [P] [US3] 在 `internal/schema/confirmation_test.go`（新增）覆盖规范草稿集合顺序、完整而非分页影响、缺失/伪造 token、改草稿、同数量换资产身份/版本、相关 schema 变化、重启密钥失效与无撤回改名不需确认，运行预期失败。
- [X] T025 [P] [US3] 在 `internal/httpapi/inheritance_confirmation_test.go`（新增）用真实 SQLite 覆盖两类 preview 到写入、confirmation_required/impact_stale、issues 不签发 token、直接解绑可选 body、旧客户端缺 token 拒绝、权限及失败零写入，运行预期失败。
- [X] T026 [P] [US3] 在 `web/tests/inheritanceConfirmation.test.tsx`（新增）覆盖类别撤回及字段编辑器解绑的影响明细/分页、取消、失败留草稿、确认时冻结、改草稿废弃 token、stale 刷新后必须再次确认、提交 loading/toast 与 UUID 冲突链接，运行预期失败。
- [X] T027 [P] [US3] 在 `internal/httpapi/schema_stale_test.go`（新增）和 `internal/importer/schema_stale_test.go`（新增）用确定性屏障复现 Prepare 后 schema 撤回/改变、随后 Persist 新建/编辑/导入；断言 409 schema_stale 与整批零写入，避免仅用已有资产 version 测试替代。

### 实现

- [X] T028 [US3] 在 `internal/asset/pipeline.go`、`internal/schema/snapshot.go` 实现 Prepared 的规范 schema 指纹与一致读取；Persist 在当前写事务首步核对字段身份/来源/规则/计算、类别上下文/编号、型号厂商默认值和上下文，新增资产同样保护；中英 schema_stale 走现有错误信封。
- [X] T029 [US3] 在 `internal/importer/preview.go` 的共享 check/checkRow 管线、`commit.go` 与 `internal/asset/pipeline.go` 让整批 Persist 共用当前 tx 的快照和核验缓存，schema_stale 整批回滚不自动重准备；在 `web/src/features/import/ImportDialog.tsx` 和 `web/src/routes/AssetDetail.tsx` 保留输入并提示刷新；在 `web/tests/import.test.tsx`、`web/tests/assetDetail.test.tsx` 补充 schema_stale 后保留草稿/整批失败 DOM 回归，验证 T027。
- [X] T030 [US3] 在 `internal/asset/schema_effects.go` 实现前后字段身份/来源差异、去重资产扫描、旧值恢复验证、必要计算及最终 claims 规划；Apply 使用调用者 tx，保留 raw attrs，更新必要 version，不调用普通 Save、不伪造流转；在 `cmd/nexus/main.go` 及 `cmd/nexus/verify_test.go`、`internal/asset/pipeline_test.go`、`internal/importer/importer_test.go`、`internal/transfer/transfer_test.go`、`internal/httpapi/nplusone_test.go` 的完整服务夹具中注入真实实现，替代 T015 的 fail-closed 过渡。
- [X] T031 [US3] 在 `internal/asset/persist.go` 增加批量唯一 claims 释放后插入、撤回全历史 suppression 与最终 search 同步；对所有最终 live claims 判冲突，来源改变更新 scope，恢复新建 unsuppressed 行不重启旧历史；验证 T023 的完整回滚与合法恢复。
- [X] T032 [US3] 在 `internal/asset/query.go` 同时修改普通搜索和 exactMatch 排除 search_suppressed，保持 ValueHistory 全历史可读及普通改号搜索；增加 `internal/asset/query_inheritance_test.go`（新增）覆盖独立有效字段同词仍命中，运行搜索回归。
- [X] T033 [US3] 在 `internal/schema/inheritance.go`、`change.go`、`confirmation.go` 实现递归裁剪、完整影响与 HMAC-SHA256 凭据；进程随机密钥，提交事务内重算并常量时间比较，missing/stale 零写入；明细分页不改变 token，验证 T024。
- [X] T034 [US3] 在 `internal/schema/binding.go`、`field_store.go`、`group_store.go` 收口直接解绑、字段创建附带绑定和整组绑定路径；组按完整最终 schema 校验；保留型号/厂商既有传播语义，类别解绑复用 planner、effects 与确认，不允许旁路直接删绑定。
- [X] T035 [US3] 在 `internal/httpapi/handlers_metadata.go`、`server.go` 接入 unbind-preview、DELETE 可选 token body 与 409 错误映射；在 `internal/i18n/keys.go`、`catalog.go` 补齐确认、恢复、冲突及 stale 文案，完成 T025 与英文 error.fields/UUID 定位验证。
- [X] T036 [US3] 在 `web/src/lib/api.ts` 增加兼容无 body 调用的 DELETE 可选 body，在 `features/categories/CategoryEditor.tsx`、`features/fields/FieldEditor.tsx` 组合受控 AlertDialog 实现异步预览/确认/失败保留；不得自动接新 token 重放写入，完成 T026。
- [X] T037 [US3] 在 `web/src/i18n/zh.ts`、`en.ts` 补齐影响与确认错误展示；在两份 `openapi.yaml` 和 `deploy/smoke.sh` 补齐 unbind-preview、DELETE body、schema_stale 及 confirmation 错误结构；运行文档合约和双语覆盖测试。

**检查点**：撤回及恢复事务、直接解绑和陈旧 Prepared 保护通过；完整上线仍依赖 US4 与 US5 的依赖、消费者和对帐。

## 阶段 6：用户故事 4——依赖与类别移动统一保存（P1）

**独立验收**：同次修正当前编号可成功，后代编号/计算依赖阻止整次提交；合法移动保留相同字段 ID 交集，来源/scope/path 正确；非法移动、树环、唯一冲突零写入。

### 测试先行

- [X] T038 [P] [US4] 在 `internal/schema/inheritance_dependencies_test.go`（新增）覆盖当前/后代编号、非唯一编号仍可选、类别/实际设备计算依赖、无资产合法设备组合、一起撤回完整计算链和整组成员顺序无关，运行预期失败。
- [X] T039 [P] [US4] 在 `internal/httpapi/inheritance_move_test.go`（新增）覆盖父级三态、子树资产移动限制、树环、后代 path、显式非法候选拒绝、省略选择时 ID 交集、同 key 不同 ID、新来源 scope 及事务回滚，运行预期失败。
- [X] T040 [P] [US4] 在 `internal/asset/unique_scope_change_test.go`（新增）覆盖多资产合法 scope 交换、未变化资产冲突、同 ID 来源变化、分页之外冲突及二阶段写入中途错误回滚，运行预期失败。
- [X] T041 [P] [US4] 在 `web/tests/categoryDraftDependencies.test.tsx`（新增）覆盖换父时当前完整草稿、迟到响应、同 ID 保留/不同 ID 不冒认、编号候选立即变化、200+issues 可修正、同次取消输入与计算字段、后代 issues 不自动修改，运行预期失败。

### 实现

- [X] T042 [US4] 在 `internal/schema/deps.go`、`refcheck.go`、`change.go` 按最终 schema 校验编号与计算依赖，覆盖受影响后代及型号/厂商组合；缺项返回结构化 issues，不自动选依赖或删后代编号；同链 key 保守守卫不随选择收窄，验证 T038。
- [X] T043 [US4] 在 `internal/schema/category_store.go`、`inheritance.go` 完成移动守卫、防树环、后代 path 与选择交集同步；应用完整草稿后校验依赖，来源改变进入效果规划，验证 T039。
- [X] T044 [US4] 在 `internal/asset/schema_effects.go`、`persist.go` 完成来源变化的最终 scope 校验与批量交换失败分支，在 `recompute.go` 将受影响范围改为真实到达，保护其独立 writeRecomputed 持久化路径：写事务内核验规划 schema/资产版本，陈旧规划整批拒绝，继承效果不得调用多 root 分事务的公共重算；在 `internal/asset/recompute_test.go` 增加规划后撤回的确定性竞争回归，验证 T040 与现有重算回归。
- [X] T045 [US4] 在 `web/src/features/categories/useCategoryDraft.ts`、`CategoryEditor.tsx` 实现换父最终预览和可修正依赖状态，issues 定位到相应输入或 UUID 对象，不阻断用户修正编号；在双语目录补齐缺项/移动错误，完成 T041。
- [X] T046 [US4] 在 `internal/httpapi/inheritance_move_test.go` 与 `web/tests/categoryDraftDependencies.test.tsx` 完整复跑移动/依赖/确认组合矩阵，并将 `quickstart.md` 第 3 节的实际验证结果记入 `verification.md`。

## 阶段 7：用户故事 5——存量与所有消费者口径一致（P1）

**独立验收**：一套三层+混合型号夹具同时检验必填、计算、详情、列、模板、导入、导出、rows、打印、搜索与 verify；撤回值只作为归档可读，所有实际有效范围一致。

### 测试先行

- [X] T047 [P] [US5] 在 `internal/asset/inheritance_required_compute_test.go`（新增）覆盖首次继承必填允许存量缺值、新建/下次编辑必填、非空旧值恢复校验、计算新增/恢复/依赖变化重算、计算失败与唯一冲突全回滚、归档输入不参与求值，运行预期失败。
- [X] T048 [P] [US5] 在 `internal/schema/inheritance_reachability_test.go`（新增）覆盖字段过滤、必填计数去重、searchable 切换不复活撤回值、兄弟同 key 字段互不重建、无直接绑定仍保留归档删除守卫，运行预期失败。
- [X] T049 [P] [US5] 在 `internal/asset/attr_filter_inheritance_test.go`（新增）覆盖撤回 raw attrs 不参与属性过滤、设备字段同 key 到达隔离、分页与 count 一致、大范围参数集合，运行预期失败。
- [X] T050 [P] [US5] 在 `internal/importer/inheritance_test.go`（新增）、`internal/httpapi/rows_test.go`、`export_test.go`、`print_test.go` 增加父类筛选含后代未继承字段为空、同 key 不同 ID、混合型号可能列、导入逐行拒绝不适用非空值、跨类别导出分包与打印一致性回归，运行预期失败。
- [X] T051 [P] [US5] 在 `cmd/nexus/verify_inheritance_test.go`（新增）覆盖合法迁移/撤回/恢复对帐及人为损坏的选择、树/path、编号/计算依赖、unique/search 漏项/残留/value/scope/live suppressed；合法兄弟同 key 与不相交设备字段不误报，运行预期失败。
- [X] T052 [P] [US5] 在 `web/tests/inheritanceConsumers.test.tsx`（新增）覆盖资产详情归档只读、编辑/录入最终字段、列表列解锁、导入/打印字段与服务端一致、真实 QueryClient 缓存失效后的 refetch；用 DOM 结果而非仅 mock 调用次数断言。
- [X] T053 [P] [US5] 在 `internal/httpapi/field_asset_count_test.go`（新增）以真实 SQLite 覆盖 GET /fields/:id/asset-count 的去重类别/型号/厂商范围、404、读权限和双语错误；覆盖 GET /fields category_id 有效过滤但 category_ids 仍只列直接绑定，运行预期失败。

### 实现

- [X] T054 [US5] 在 `internal/asset/schema_effects.go`、`validate.go`、`recompute.go` 完成存量必填豁免与恢复非空值校验的分离、必要计算闭包及编译缓存；最终有效输入求值，新计算结果严格验证，失败不落任何计算/索引/version，验证 T047。
- [X] T055 [US5] 在 `internal/schema/field_store.go`、`refcheck.go`、`binding.go` 将 searchable 重建、字段 category_id 过滤、字段影响计数及删除守卫改为字段 ID 实际到达；同 key 归档归属不明保守拒删，禁止裸 key 全库 DELETE/json_remove，验证 T048。
- [X] T056 [US5] 在 `internal/httpapi/handlers_metadata.go`、`server.go` 接入字段 asset-count，只读开放、不加权限开关；在 `web/src/features/fields/FieldForm.tsx`、`FieldEditor.tsx` 使用单个去重计数，不再逐绑定相加；补充必填提示 DOM 测试，验证 T053。
- [X] T057 [US5] 在 `internal/asset/query.go` 对 AttrFilters 结合快照推导的有效到达谓词与 raw JSON 值条件，所有值参数化，分页/count 同口径，避免 N+1 与 SQLite 参数上限；验证 T049。
- [X] T058 [US5] 在 `internal/importer/template.go`、`resolve.go`、`preview.go`、`export.go`、`rows.go`、`export_many.go` 复用类别+型号的快照适用性按字段 ID 判每行；表头仍由请求 schema 决定，混合型号列及跨类别分包不变；更新 `internal/httpapi/handlers_print.go` 的数据消费者，验证 T050。
- [X] T059 [US5] 在 `cmd/nexus/verify.go` 用一致快照推导每资产预期 unique/search 集并双向核对，增加树/选择/依赖与真实绑定冲突矩阵校验，保留事件链及普通历史语义；不自动清理历史或修复数据，验证 T051。
- [X] T060 [US5] 在 `web/src/features/categories/CategoryDetail.tsx`、`features/assets/NewAssetDialog.tsx`、`features/assets/ExportDialog.tsx`、`routes/AssetDetail.tsx`、`routes/Assets.tsx`、`features/print/PrintDialog.tsx`、`features/print/usePrinting.ts` 接入最终有效字段语义；在共用 mutation 成功处理处失效类别/schema/字段/资产/引用/计数缓存，移动另失效 overview，完成 T052。
- [X] T061 [US5] 在两份 `openapi.yaml`、`deploy/smoke.sh` 增加字段 asset-count 及本轮最终响应/错误合约；在 `internal/i18n/keys.go`、`catalog.go`、`web/src/i18n/zh.ts`、`en.ts` 补齐消费者、计数和归档相关文案，中英文参数及键覆盖测试通过。
- [X] T062 [US5] 在 `docs/rules/schema.md`、`domain.md`、`web-forms.md` 写明正向选择、原始来源、历史搜索例外、实际到达计数/筛选、只读归档、统一草稿/确认与 UUID 操作；按 `quickstart.md` 第 4–6 节核对同一夹具所有消费者，记录 `verification.md`。

## 阶段 8：跨故事验收与交付门禁

**目标**：全部故事正确之后验证规模、兼容、安全与真实构建；不以文档检查代替实现门禁。

- [X] T063 在 `internal/httpapi/perf_test.go`、`nplusone_test.go` 增加万级资产、多级类别、多型号及分页预览数据；测量列表/单条读写 p95、批量继承总耗时/锁持有时间、schema 查询数随资产增长保持常数种加载；结果及环境写入 `verification.md`，超标在 `plan.md` 偏离表登记原因和收敛决定。
- [X] T064 在 `web/tests/categoryInheritance.test.tsx`、`inheritanceConfirmation.test.tsx`、`inheritanceConsumers.test.tsx` 完成中英、键盘、focus、窄屏、长字段/来源、loading/empty/error、取消/成功/失败的 DOM 与浏览器走查；测交互反馈和首屏可交互时间，记录 `verification.md`。
- [X] T065 运行 `gofmt -l ./cmd ./internal ./migrations`、`go vet ./...`、`golangci-lint run`，在 `verification.md` 保存实际命令、退出状态及失败修复结果；要求格式输出为空、静态检查零告警。
- [X] T066 运行 `go test ./...` 并单独生成覆盖率报告，逐包核验继承解析、规范化、computed、唯一、重算及 verify 六块核心管线语句覆盖率 ≥80%；在 `verification.md` 记录测试与覆盖率，任何现存失败也必须报告，不用新增文件覆盖率替代包覆盖率。
- [X] T067 在 `web/` 运行 `npx tsc --noEmit`、`npx eslint .`、`npx vitest run --maxWorkers=4`、`npm run build`，核验初始 chunk gzip <500KB；在 `verification.md` 保存实际结果，禁止沿用 030 或非唯一编号轮次结论。
- [X] T068 按 `README.md`/部署脚本实际嵌入产物路径执行 CGO_ENABLED=0 构建，在临时种子库运行 `nexus verify`、更新后的 `deploy/smoke.sh` 与 healthcheck，核验所有新增路由身份及合法响应结构；所有结果写入 `verification.md`，不操作生产库、不推送或发 tag。
- [X] T069 对 `specs/031-selective-field-inheritance/quickstart.md` 完整验收矩阵收尾，执行 `git diff --check`、双份 OpenAPI 一致性、双语目录覆盖及新增组件来源检查；在 `verification.md` 汇总七条门禁、未解决项和性能偏离，确认所有 T001–T068 真实完成后才标记整体交付。

## 依赖与执行顺序

```text
准备 T001–T002
  → 一致读取 T003–T004
  → US2 T005–T010（迁移与解析）
  → US1 T011–T022（草稿与基础交互，影响写入 fail closed）
  → US3 T023–T037（资产效果、确认、直接解绑、Prepared 防陈旧）
  → US4 T038–T046（依赖、移动与来源范围）
  → US5 T047–T062（存量/消费者/verify）
  → T063–T069（全量交付验收）
```

- 每个故事的测试任务可在该阶段开始后独立编写；实现必须等对应测试实际出现预期失败。
- US2：T007 等 T005；T008 等 T006/T007；T009–T010 等解析及迁移完成。
- US1：T014–T017 顺序推进；T019 可在接口/草稿类型明确后开始，T020–T021 依赖 T019；T022 等路由与响应稳定。
- US3：T028–T029 必须在允许受影响资产的变更提交前完成；T030–T031 再接入资产效果；T033 等效果可给完整影响；T034–T036 接入所有入口；T037 收口合约。
- US4：T042–T044 后端最终行为完成后 T045 验证完整 UI；T046 验证组合而非单路径。
- US5：T054–T059 分别对应 T047–T051/T053；T060 等最终读接口稳定；T061–T062 收口。
- 跨故事共享 `change.go`、`schema_effects.go`、`handlers_metadata.go`、CategoryEditor、双语目录和合约文件，因此**不把整个故事并行写入**。
- 任何未完成安全项都阻断上线，不用“后续阶段会修”放行当前半功能部署。

## 并行示例

| 故事 | 同阶段可并行的测试任务 | 前提与限制 |
|---|---|---|
| US2 | T005 旧结构迁移；T006 快照解析 | T004 完成；各自不同测试文件，依赖迁移的解析执行等 T007 |
| US1 | T011 领域；T012 HTTP；T013 DOM | US2 完成，共用契约但不同时改共用 fixture |
| US3 | T023 效果；T024 签名；T025 HTTP；T026 DOM；T027 并发 | US1 完成；测试文件独立，数据库夹具各自隔离 |
| US4 | T038 依赖；T039 移动；T040 scope；T041 DOM | US3 完成，生产文件串行修改 |
| US5 | T047 存量；T048 到达；T049 筛选；T050 导出；T051 verify；T052 DOM；T053 HTTP | US4 完成；共享 rows/export/print 测试文件不得另分重复写者 |

并行仅用于独立工作；全量 Vitest 始终最多 4 workers，不并行启动多套全量运行挤占机器。

## 需求覆盖索引

| 需求 | 主要任务 |
|---|---|
| FR-001–003 | T006、T008、T011、T014、T016、T053、T055 |
| FR-004 | T005–T010 |
| FR-005 | T009、T011、T023、T033 |
| FR-006–009 | T023–T025、T030–T035 |
| FR-010–013 | T038–T046 |
| FR-014–015 | T023、T030、T047、T054 |
| FR-016–017 | T003–T004、T023–T035、T039–T044 |
| FR-018–019 | T011–T022、T026、T036、T041、T045 |
| FR-020 | T006、T008、T047–T062 |
| FR-021 | T034、T038、T042、T044、T048、T051、T053、T055–T059 |
| FR-022 | T012、T017、T020、T025、T035、T053、T056 |
| FR-023–024 | T013、T018、T021、T025–T026、T035–T037、T041、T045、T052、T060–T064 |
| FR-025 | T012、T022、T025、T037、T050、T053、T061、T068–T069 |
| SC-001–002 | T005–T013、T023、T033 |
| SC-003–004 | T023–T044、T047、T054 |
| SC-005 | T047–T062 |
| SC-006–007 | 各故事测试任务及 T063–T069 |

## 实施策略与最小交付

- **最小演示**：基础 + US2 + US1，可在临时开发库演示默认不选、三级选择和草稿保存；尚未实现资产效果时必须 fail closed，不能对有存量的生产库开放。
- **最小可发布范围**：五个故事和全部门禁。此特性改变持久化语义，不能只发布 US1，否则索引、历史搜索与下游输出会互相矛盾。
- 每阶段独立夹具验收帮助定位回归，不等于互不依赖或允许分别上线。
- 新发现与规划冲突先记录并修正文档；不自行放宽原子性、已有移动限制或同链 key 守卫。
- 本清单不授权 push、tag、生产迁移或发布。执行命令、失败分支与门禁结果以 `verification.md` 为证据，未运行不得记为通过。
