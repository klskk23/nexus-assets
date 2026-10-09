# 031 规则同步核对

本文件记录 T062 的规则替代、源码核对与本次定向验证，不替代 `verification.md` 的整轮验收。
依据为章程 v1.3.0、当前 `spec.md`、`plan.md` 与 `quickstart.md` 第 4–6 节。
未运行全量门禁，也未把多组自动化夹具称为“同一夹具完成全部消费者实机走查”。

## 已替代的旧口径

| 旧规则 | 031 现行规则与原因 | 同步位置 |
|---|---|---|
| 类别链自动并集、祖先字段自动下传 | 只按 field ID 选择直接父类有效字段，再加自身直接绑定；新字段默认不选，恢复不复活后代选择。否则父类变化会绕过用户选择 | `docs/rules/schema.md`、`domain.md` |
| 经过哪层，来源就变成哪层 | 来源和唯一 scope 保留最初直接绑定类别；移动导致同 ID 来源变化也重新检查 | `docs/rules/schema.md`、`domain.md` |
| 唯一约束覆盖绑定类别整棵子树 | 范围 ID 不变，但只约束实际生效资产；撤回释放，恢复按最终 claims 检查 | `docs/rules/schema.md` |
| 归档唯一行一律可搜 | 继承撤回同时抑制该资产该字段的当前和历史唯一行；普通改号历史不受影响，恢复不解禁旧抑制历史 | `docs/rules/schema.md`、`domain.md` |
| 存量免必填可以理解为旧值都不校验 | 仅非计算字段存量缺值豁免；恢复非空静态值严格校验，必要计算成功且唯一才能提交 | `docs/rules/schema.md`、`domain.md` |
| 路径前缀代表字段作用范围 | 过滤、计数、引用、重算和重建按 ID 与实际到达；同链 key 保守守卫仍不放宽 | `docs/rules/schema.md`、`domain.md` |
| 无直接绑定就没有删除阻塞 | 无绑定仍保护归档值；无法证明同 key 值属于其他有效定义时保守拒绝，不全库删 key | `docs/rules/schema.md` |
| 编号候选含所有祖先绑定 | 只含最终草稿类别有效字段；设备字段不作类别编号，编号仍可非唯一，目标始终 UUID | 三份规则 |
| 类别编辑器不管理任何字段 | 只新增继承选择，直接绑定仍由字段编辑器管理，详情保持只读 | `docs/rules/schema.md`、`web-forms.md` |
| 解绑一句确认即可写入 | 类别解绑和撤回都先只读预览、受控确认；完整草稿与影响由 HMAC token 绑定，过时后刷新与再次确认分开 | `docs/rules/schema.md`、`web-forms.md` |
| 原始 JSON 有值即可输出或过滤 | 每行按类别与型号有效 field ID 决定单元格；属性过滤共同约束到达范围和值，归档值不能冒充有效值 | `docs/rules/domain.md` |

保留不变：型号/厂商实时传播与设备绑定互斥矩阵、设备唯一范围 `f:<field_id>`、同链 key 保守冲突、兄弟及不相交型号可重名、直接绑定列表 `category_ids`、跨类别导出分包、权限和 UUID 身份，以及 Nocturne 与其他无关表单规则。

## 源码核对落点

- `internal/schema/snapshot.go`、`inheritance.go`、`resolve.go`：逐层选择、按 ID 校验候选、顺序与原始来源、向下裁剪、保守同链 key。
- `internal/schema/confirmation.go`：HMAC-SHA256 覆盖操作/目标、完整草稿、前后 schema、完整变化、受影响资产行与唯一 claims；分页不参与摘要裁剪，问题阻塞签发。
- `internal/schema/reachability.go`、`field_store.go`、`refcheck.go`：真实到达计数/过滤、直接绑定列表、实际引用交集、无绑定归档值删除保护。
- `internal/asset/schema_asset_plan.go`、`schema_effects.go`、`schema_claims.go`：保留 raw attrs、恢复非空值校验、版本/索引原子更新、撤回抑制和恢复 live claim。
- `internal/asset/query.go`：普通搜索与精确匹配均过滤抑制行，历史展示仍可读；属性过滤叠加有效到达谓词。
- `internal/importer/export.go`、`rows.go`：`EveryPossibleField` 保留请求列集，`FieldAppliesTo` 按行的字段身份过滤有效值。
- `web/src/features/categories/CategoryEditor.tsx`、`useCategoryDraft.ts`、`InheritanceConfirmation.tsx` 及 `features/fields/FieldEditor.tsx`：统一草稿、编号候选、冻结确认、类别解绑预览、过时后显式刷新。

## 本次实际运行

### 定向 Go 回归

```sh
go -C /home/land/project/nexus-assets test ./internal/schema ./internal/asset ./internal/importer -run 'Test(Inheritance|CategoryConfirmation|UnbindPreview|UnbindRejects|SchemaEffectsRestoreStaticValues|SchemaEffectsRestoresOnlyNecessaryComputations|SchemaEffectsWithdrawal|SchemaEffectsFinalScopeExchange|SchemaClaims|SchemaConfirmation|MigrationSelection)' -count=1
```

结果：三个包均通过，耗时分别为 2.561s、2.666s、0.297s。
覆盖选择与迁移、依赖、撤回/恢复、唯一及搜索历史、实际到达、归档删除保护、确认与导入导出等选定测试；不代表三个包的所有测试都执行过。

### 定向 DOM 回归

```sh
/home/land/project/nexus-assets/web/node_modules/.bin/vitest run --root /home/land/project/nexus-assets/web tests/categoryInheritance.test.tsx tests/categoryDraftDependencies.test.tsx tests/inheritanceConfirmation.test.tsx tests/inheritanceConsumers.test.tsx --maxWorkers=4
```

结果：4 个文件、28 个测试全部通过，总耗时 6.58s。覆盖完整/跨页选择、初始空选择、旧请求隔离、编号错误定位、冻结草稿、取消、过时确认与解绑、实际计数及消费者缓存刷新。
Node 输出 `localStorage` 实验性可用性警告；没有测试失败。

## 未冒充完成的验收

- `quickstart.md` 第 4、5 节的旧值、唯一冲突、必填与计算已有上述定向回归证据，但本次没有浏览器里重新执行完整操作链。
- 第 6 节要求同一组混合型号资产逐项核对类别详情、schema、资产详情/编辑、录入、编号、列解锁、模板、逐行导入、CSV、rows 和打印。本次只核对相关源码和定向测试，不能据此宣称这套端到端矩阵已全部完成。
- 未执行全量 Go/Vitest、覆盖率、lint、生产构建、临时种子 verify、smoke 或万级性能测试；T062 或整轮门禁是否勾选由汇总验收决定。

## 发现的实现与计划差距

`plan.md` §4 规定受影响资产“分批扫描”，当前 `internal/asset/schema_effects.go` 的
`loadSchemaAssets` 仍把查询结果一次全部收集到 `[]model.Asset`，`Plan` 再持有全部效果。
它保持单事务语义，但尚未实现计划中的分批扫描；万级内存与锁持有时间仍需实测或补齐实现。
本次不改业务代码、不把这一差距改写为已批准的规则偏离。

本次核对范围内未发现需要把正向选择、归档、搜索抑制、确认或 UUID 语义改回旧规则的理由。
