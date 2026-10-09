# 实施计划：类别字段可选继承

**分支**：`031-selective-field-inheritance` | **日期**：2026-09-30 | **规格**：[spec.md](spec.md)

**状态**：技术设计完成；本文件规定实施与验收方式，不表示代码、迁移或门禁已经完成。

## 概要

把类别的祖先字段自动并集改为正向逐字段选择。旧库迁移回填现有继承结果，新建子类默认不选；之后父类新增或恢复字段均不自动下传。`category_fields` 继续只表示直接绑定，新表 `category_field_selections` 只保存选择的字段 ID，原始来源与顺序由直接父类有效集递推。

统一批量快照解析、只读草稿预览和事务内变更规划。撤回向下清理失去来源的选择，保留资产原值但释放有效唯一值、清除有效搜索并抑制相关唯一历史搜索；恢复执行旧值与必要计算校验。类别、选择、资产版本、计算和派生索引在一个写事务中提交。现有类别编辑对话框增加继承区，直接绑定仍由字段编辑器管理。

完整交付包含存量迁移、撤回与恢复、依赖、确认、并发保存防护和所有消费者，不能上线只有选择表及勾选框的中间态。

## 技术背景

| 项目 | 本轮选择 |
|---|---|
| 语言 | Go 1.26；TypeScript 5.7、React 19 |
| 后端依赖 | 现有 Gin、modernc.org/sqlite、goose、expr-lang/expr；不新增第三方依赖 |
| 前端依赖 | 现有 Vite 6、react-router、TanStack Query、Tailwind 4、shadcn/ui / Radix |
| 存储 | SQLite WAL；`BEGIN IMMEDIATE`；写连接池 1；SQL 迁移随二进制 embed |
| 测试 | Go testing 与真实临时 SQLite；Vitest 3、React Testing Library、jsdom；全量前端固定 `--maxWorkers=4` |
| 平台与交付 | 浏览器 SPA、Linux 服务；`CGO_ENABLED=0` 静态二进制包含前端，scratch 镜像不依赖 shell |
| 性能目标 | 万级资产、十人级并发；列表 p95 < 200ms，单条读写 p95 < 100ms；交互反馈 < 100ms，超过 300ms 有 loading |
| 资源约束 | 初始 chunk gzip < 500KB、首屏可交互 < 1.5s；新增列表默认 50、上限 200；无按资产逐条 schema 查询 |
| 范围 | 类别、字段、资产管线、导入导出、打印数据、verify、API 与前端；不改变型号/厂商传播与权限模型 |

表达式使用由 011 及 `docs/rules/expr.md` 确立的 `expr-lang/expr` 引擎，本轮不替换引擎或放松 AST 护栏；`text/template` 仅作为历史迁移背景。章程 v1.3.0 已同步该现行约束，本轮不引入新依赖。

## 章程检查

依据 `.specify/memory/constitution.md` v1.3.0。研究前审查与设计后复核均覆盖以下五项；下列是设计约束，不冒充实施测试结果。

| # | 原则 | 研究前约束与设计后结论 |
|---|---|---|
| I | 代码质量 | HTTP 只解码与渲染；schema 拥有变更规划，asset 实现窄派生接口，store 提供事务读取抽象。禁止 schema 反向导入 asset、嵌套事务和事务内回读 ReadDB。无新增第三方依赖。按快照、差异、凭据、资产效果拆文件，保持圈复杂度 ≤15；错误保留链并交 i18n 边界。实施后真跑 gofmt、vet、lint、tsc、ESLint。 |
| II | 测试标准 | 解析、旧结构迁移、恢复校验、computed、唯一批量交换、schema 并发和 verify 都覆盖成功及失败。新改端点使用真实 SQLite；CategoryEditor、新建、FieldEditor 解绑、确认与 stale 每条交互均有 RTL DOM 测试，不能只测工具函数。六类核心管线包覆盖率 ≥80%，不得只统计新增文件。种子 verify、全量 Go/Vitest 和回滚快照比较是交付门禁。 |
| III | 用户体验 | 复用 Dialog、AlertDialog、Checkbox、Field/FieldGroup/FieldSet、Select、Alert、Empty、Skeleton/Spinner、Table、Badge 和既有提示组件；不新增自定义基础组件。继承区是这些组件的业务组合。保留 Nocturne token、键盘焦点及窄屏；加载失败不清空选择，写入有 loading、成功/失败 toast、error.fields。确认冻结草稿且可取消，失败留在编辑器。 |
| IV | 性能 | 选择表复合主键和 field_id 反向索引；快照常数种批量查询并按类别/型号缓存；影响列表分页，签名覆盖全量；资产分批扫描但只用一个写事务。导出逐行适用性在内存判定，无逐行查库。性能与锁持有时间实测，任何超标登记下方偏离表，不以异步最终一致规避。 |
| V | 语言 | 规格、计划、任务与规则文档中文，标识符、注释、日志英文。新增可见文案包括继承区/来源/空候选、影响类型及数量、恢复冲突、缺少依赖、确认过时与 schema 变化；前端 zh/en、后端 keys/catalog 同步。领域返回消息对象，HTTP 用 userText；UUID、key、路径、error.code 不翻译。 |

**复核结论**：设计不要求放宽五项原则；未引入未经批准的组件、权限或框架。实现与实测不满足约束时阻断交付并记录，不能提前勾选门禁。

## 项目结构

### 本轮文档

```text
specs/031-selective-field-inheritance/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/inheritance.md
├── checklists/requirements.md
└── tasks.md                         # 按故事组织的测试先行任务
```

### 代码落点

以下新增文件是实施落点而非当前已存在的产物；测试与对应包并置。

```text
migrations/
  024_selective_field_inheritance.sql  # 拟新增，实施前再次确认编号
internal/store/
  selective_field_inheritance_test.go  # 拟新增，旧结构迁移测试
  tx.go                               # Querier 与一致读事务
internal/schema/
  snapshot.go                         # 拟新增，批量加载与缓存解析
  change.go                           # 拟新增，预览/提交编排及窄接口
  inheritance.go                      # 拟新增，选择与向下裁剪
  confirmation.go                     # 拟新增，规范摘要与 HMAC
  resolve.go, binding.go              # 有效集与绑定写入口
  category_store.go, field_store.go
  refcheck.go, deps.go, group_store.go
internal/asset/
  schema_effects.go                    # 拟新增，存量校验、计算与索引效果
  pipeline.go, persist.go              # Prepared 防陈旧及事务索引写入
  query.go, recompute.go               # 有效搜索/筛选与重算
internal/importer/
  export.go, rows.go                   # 每行类别+型号字段身份判定
  preview.go, resolve.go               # 导入与保存复用最终 schema
internal/httpapi/
  handlers_metadata.go, server.go      # 类别/字段入口与路由守卫
  docs/openapi.yaml
internal/i18n/
  keys.go, catalog.go
cmd/nexus/
  verify.go, verify_test.go            # 双向有效索引与结构对帐
web/src/
  features/categories/CategoryEditor.tsx
  features/categories/CategoryDetail.tsx
  features/fields/FieldEditor.tsx
  features/fields/FieldForm.tsx
  routes/Categories.tsx
  lib/api.ts, lib/types.ts
  i18n/zh.ts, i18n/en.ts
web/tests/                            # 类别、字段、资产与打印 DOM 回归
specs/001-asset-ledger-demo/contracts/openapi.yaml
deploy/smoke.sh
docs/rules/schema.md, domain.md, web-forms.md
```

保持现有仓库和包边界，不新增独立服务或通用规则框架。公共事务接口及新 planner 的测试需在使用入口接入之前就提供失败案例。

## 技术设计

### 执行口径补充

- 迁移回填按旧解析器的根到叶顺序处理：每个非根类别只写入其原先严格祖先有效字段的唯一 `field_id`；重复 ID 保留首次出现的顺序，直接绑定不写入选择表。旧字段 ID 及其原始直接绑定类别是唯一来源依据，不按 key 去重；同 key 不同 ID 继续由现有链路冲突校验阻断。
- 预览返回 HTTP 200 仅表示草稿已解析；存在 `issues.items` 时不得签发 `confirmation_token`，前端可修正后重新预览。语法错误/非法 presence 返回 400，不存在的目标返回 404，缺少确认或 token/影响摘要不匹配统一返回 409，且在任何元数据、资产、索引或审计写入前失败。
- 只读 `Querier` 的最小边界是 `QueryContext`、`QueryRowContext`；写事务继续由调用方持有 `*sql.Tx`，不得把 `ExecContext` 暴露给快照读取器。`SchemaSnapshot` 只接受该读边界或当前写事务的同等查询能力，并保存规范化的类别、字段、绑定、选择、型号/厂商关系。fingerprint 对规范化 JSON/字节摘要做 SHA-256，覆盖完整有序字段身份、来源、规则、依赖、编号、类别上下文和实际设备默认值；分页只影响返回明细，不影响摘要。
- 普通保存、编辑、新资产、整批导入与 Recompute 均在写事务首个领域写入前核验 fingerprint；屏障测试必须证明 `schema_stale`/零写入，并使用确定性同步而非等待时间。导入按批次回滚，Recompute 按调用批次回滚。

### 1. 存储、迁移与统一解析

详见 [data-model.md](data-model.md)。迁移回填每个非根类别旧语义下的严格祖先字段，保留原始直接绑定。选择表不保存来源、规则或排序，不存在 inherit_all 模式。`search_suppressed` 默认 0，使旧唯一历史保持可搜。

`SchemaSnapshot` 通过统一 `store.Querier` 从同一读事务或当前写事务批量加载。根到叶解析选中父字段，再追加自身字段；来源为最初直接绑定类别。缓存类别结果及设备侧型号结果，不让每台资产触发重复 schema SQL。

保持三种接口：`EffectiveFields` 回答类别有效集；`FieldsForAsset` 加实际型号/厂商；`EveryPossibleField` 为混合型号模板保留可能列。`category_ids` 仍为直接绑定事实，类别过滤才按有效到达。绑定冲突仍按既有矩阵：同链 key 保守拒绝，合法兄弟与不相交设备侧不误报。

### 2. 领域变更编排与包依赖

schema 定义变更请求、前后快照、差异以及资产效果接口；asset 实现接口并在应用组装处注入。schema 不 import asset。效果规划只接受当前 Querier、前后快照及完整 ChangeSet，返回带阻塞 issues、资产影响和事务 Apply 的准备结果。

生产组装必须提供真实效果实现；缺少实现时有资产影响的变更明确报错，不能静默 no-op。纯解析测试可直接测试快照，集成测试使用完整组装。

预览：开启一致只读事务 → 加载快照 → 在内存应用草稿 → 递归裁剪失去来源的后代选择 → 计算字段身份/来源差异 → 校验依赖、存量与最终 claims → 生成完整影响与凭据 → 只读结束。禁止先改数据库再回滚模拟预览。

提交：`BEGIN IMMEDIATE` → 重新加载/规划/校验 → 检查所确认的完整影响 → 写元数据与选择 → 应用资产效果 → 一次提交。任何错误返回前回滚，不能分后代或资产提交。

现有类别 Create/Update、直接 Bind/Unbind、字段创建附带绑定、字段组创建及绑定等入口必须收口。组绑定按最终整组集合校验，不能让成员写入顺序决定依赖是否成立。内部 `*Tx` 辅助函数只落数据，不再另开事务；效果 Plan/Apply 不调用普通 Save。

### 3. 草稿、依赖与移动

请求 presence 解码区分继承选择 omitted / [] / null；null 非法。更新父级仍区分 omitted / null / ID。客户端显式选择非法候选报错；换父且省略选择时服务端保留新候选 ID 交集。详情 schema 不混入候选。

先应用同次编号更改，再按最终有效集校验当前与后代编号；非唯一编号继续合法，UUID 身份不变。计算依赖从最终类别与实际设备组合校验，设备计算依赖类别输入也不能遗漏。无资产的合法设备组合仍须有定义层依赖检查，不等到新增资产才发现破坏。

移动继续执行原子树资产限制，并补全树环检查及全部后代 path 更新；同 ID 新来源要重新计算 scope。同链同 key 冲突守卫刻意不按选择缩小，避免 raw attrs 身份混淆。

### 4. 存量效果与唯一 claims

按类别差异获取受影响资产 UUID 去重，分批扫描并缓存相同 schema 的拓扑与表达式编译。保留 raw attrs，只有最终有效输入参与校验/求值：

- 新选/恢复的非空静态值执行当前规范化、类型、格式、范围校验。
- 非计算必填字段缺值沿用存量豁免；不填虚构值，普通新建/编辑仍严格必填。
- 新增/恢复计算字段及依赖变化的计算闭包必须成功求值，计算结果不享受缺值豁免。
- 唯一验证使用所有资产的最终 claims，包含未变化资产；先验证重复，再统一释放变化的 live claims，最后插入新 claims，避免合法 scope 交换被中间态阻断。
- 撤回使该 asset_id + field_key 的当前和历史唯一行 suppressed；当前行同时归档。字段仍有效的来源变化只调整 scope，不把整段历史误当撤回。
- search 索引按最终有效 Findable 集重建；恢复创建新的 unsuppressed live 行，不重置旧 suppressed 历史。
- 字段有效性或来源变化即使 attrs 文本不变，也增加资产 version；计算变化沿用现有审计约定，不伪造流转事件。

### 5. 普通保存与导入的陈旧 Prepared 防护

给 Prepared 记录生成时的相关 schema 指纹。指纹基于有序字段 ID、来源、规则、计算依赖、类别表达式上下文、编号及实际型号/厂商默认值和上下文，不只包含字段数量或类别 ID。

Prepare 从一致读取快照准备；Persist 在写事务内、任何资产或索引写入前重新从同一事务快照校验。指纹不一致返回可本地化的 `409 schema_stale`，不偷偷采用新 schema 重写已确认的导入内容。导入整批失败回滚并要求刷新预览；普通编辑保留草稿重新加载字段。新增资产也受保护，不能只靠旧资产 version。

批量导入在一个写事务内共享快照和已核对的类别/型号指纹缓存；不得为每行从 ReadDB 加载全库。事务内元数据没有变更时可复用；包含元数据修改的领域事务必须使用对应新快照，不能复用修改前的验证缓存。

`Recompute` 的 `writeRecomputed` 是独立持久化路径，不经过 Persist；同样必须在写事务中核对规划 schema 与资产版本，陈旧时整批拒绝，不能留下绕过上述保护的第二条写入路径。

### 6. 搜索、属性筛选、字段重建与删除

普通搜索与 exactMatch 同时过滤 suppressed 唯一行；ValueHistory 仍返回历史。普通资产改号历史继续可搜，不能全局禁用 archived 搜索来实现本轮。

`AttrFilters` 不能只用 raw JSON 相等。查询先从同一快照取得该 key 的有效类别或设备适用范围，用参数化集合谓词与 JSON 取值条件共同过滤；分页及 count 使用完全相同的谓词。同 key 的不同字段保持各自到达范围，不引入逐行查询。较大 ID 集合可用现有 SQLite JSON 能力作为绑定参数展开，避免拼接 SQL 字面值与变量上限。

`reindexField` 按 field ID 和实际到达资产重建，不再按 key 全库 DELETE/INSERT。字段删除保留归档属性守卫；无直接绑定也检查保留值，无法证明同 key 归档值属于其他定义时保守拒绝，不全库 json_remove。

### 7. 所有消费者与 verify

导出、rows 和打印列仍来自请求 schema，而每行必须按资产类别+实际型号判定字段 ID 是否有效。父类筛选含后代时，未继承的后代单元格为空，即使 raw attrs 有值。快照缓存支持逐行内存判定，不根据本次数据并集临时改表头。导入模板继续包含混合型号可能列，逐行拒绝不适用字段的非空值。

资产详情只把撤回值放入归档属性；列表列、录入、编号、类别详情均使用最终有效集。审查所有祖先 path 查询，树查询仍可保留 path，字段到达查询不得直接沿用。

verify 复用一致快照，核对树/path、根选择、直接绑定重复选择、非法候选、最终依赖，并为每资产推导预期唯一及搜索值。双向检查遗漏、残留、value、scope 和 live suppressed，保留事件链原检查。key 冲突采用真实绑定矩阵，不按全库 key 一刀切；不凭当前 schema 擅自修复普通历史值。

### 8. API、确认与界面

详见 [contracts/inheritance.md](contracts/inheritance.md)。保留 POST/PATCH 类别保存入口，新增新建/编辑预览、直接解绑预览和字段影响资产计数。同步两份 OpenAPI、路由鉴权、错误目录与 smoke。

撤回凭据使用进程随机密钥 HMAC-SHA256，规范化并绑定操作、目标、完整草稿、相关 schema、完整影响、资产 UUID/version 与校验数据；分页不影响摘要。缺少凭据 `confirmation_required`，不匹配 `impact_stale`，均 409 零写入。重启使旧凭据失效，不新增持久化密钥配置。

前端新建页与 CategoryEditor 共用继承草稿逻辑，不仅修改编辑入口。加载现有选择与用户显式清空是两个状态；候选分页不能丢掉其他页已选 ID。换父保留交集，旧请求不能覆盖新草稿；编号候选来自完整最终 fields。确认期间冻结提交草稿，任何更改废弃旧凭据。

直接解绑在 FieldEditor 先预览，再用受控 AlertDialog 展示影响和 issues；DELETE 支持可选 body。确认失效保留草稿并刷新影响，但不得自动接收新 token 重试。无 schema.manage 禁用并说明，服务端写守卫独立执行，读预览沿用既有认证内读开放规则。

成功统一失效类别/schema、字段、资产列表/详情、绑定计数和引用缓存；移动另失效类别计数与概览。使用 QueryClient 真实 refetch 的 DOM 测试，不能只断言 mock 的 invalidate 被调用。

## 实施顺序与验证

1. **基础与 US2 迁移**：旧结构迁移夹具先红；添加选择及 suppression 列；批量快照和解析测试；旧结果逐项等价。
2. **US1 正向选择**：省略/空/null、来源、三层选择、直接绑定规则；统一领域草稿、HTTP 与新建/编辑 UI，不上线未完成的中间态。
3. **US3 安全撤回恢复**：资产效果、释放/恢复、搜索抑制、确认/取消/stale、直接解绑；失败全表快照比较。
4. **US4 依赖及移动**：同次改编号、设备计算依赖、来源变化、树环与 path、最终 claims 批处理及 schema_stale 并发回归。
5. **US5 消费者统一**：必填与计算、搜索重建/属性筛选、字段计数与删除、导出/rows/打印、verify、前端缓存和双语。
6. **交付验收**：按 quickstart 真跑七门禁及构建、smoke、万级性能、bundle、键盘/窄屏；记录命令与结果，不复用前轮记录。

按测试先行执行：每个实现行为先运行对应失败测试，最小实现后跑定向与相关包回归，最终跑全量。新建继承 API 不能用来伪造旧库迁移数据。并发测试用确定性屏障而非 sleep：覆盖预览到提交资产集合同数换人、Prepare 到 Persist 新建/编辑、完整导入回滚及唯一 scope 交换。

后续 `/speckit-tasks` 按用户故事细化可执行任务；`/speckit-analyze` 只读检查覆盖及一致性，之后才进入实现。

## 复杂度与偏离记录

以下为 2026-10-08 的实测取舍与剩余验证边界，不是用户对性能豁免或发布的批准。完整数据见 [verification-performance.md](verification-performance.md)。

| 项目 | 当前处理与实测 | 收敛方向及不能采用的更简方案 |
|---|---|---|
| 万级资产变更的单事务耗时 | 撤回10,000台保存2.785s，锁边界2.753–2.785s；恢复3333/3334台保存0.720–0.993s。普通列表最慢p95 137.012ms、单条更新2.146ms达标，但不能用于宣称整批变更低于100ms。保持原子语义，界面显示提交中并禁止重复提交 | 已将相关JSON扫描改为索引查找，首批恢复231.90s降至0.720s；后续评估合并资产/index写语句以减少80,024条撤回写入。不能拆多事务或异步暴露混合schema。长事务影响其他写请求，仍为交付风险而非已获豁免 |
| 规划内存 | raw扫描按128条单游标消费，不再全量staging；最终effects/claims仍O(N)。万级撤回preview+save累计分配721.84MiB，结束堆62.52MiB，不是峰值RSS | 后续采样峰值RSS并减少重复attrs/签名序列化，保持最终批次完整冲突校验，不能用分批提交规避内存 |
| 测量环境 | SQLite位于tmpfs，单请求顺序样本；无持久磁盘与十并发基线 | 上线前补目标磁盘及并发尾延迟；不把当前数字当作生产保证 |
| 前端性能验收 | 初始JS gzip 215.36KB达标；最终嵌入生产bundle直连真实localhost后端，5次清缓存并禁缓存，导航至真实点击后编辑弹窗可见中位226ms、p95/max451ms，均<1.5s；随后各5102ms无Long Task且HTTP并发0。预览/解绑/stale/错误/提交中浏览器矩阵及20ms开发rAF反馈样本另见前端专项 | 这是固定业务可交互指标，不冒充Lighthouse标准TTI。第一样本启动有84ms Long Task，在可交互前结束；同进程、无CPU/网络限速，不能代替目标部署环境或所有页面保证。早期模拟API151/239ms仅保留历史，不作为真实后端证据 |
| 历史属性仅按 key 存储 | 删除定义时对归档值采用保守保护，限制说明见 research R7；不承诺精确历史 provenance | 按 key 全库清除会损失旧值，新增全量属性身份迁移超出范围 |

安全降级和备份恢复见 [quickstart.md](quickstart.md)。本轮没有生产库操作、推送、tag 或发布授权。
