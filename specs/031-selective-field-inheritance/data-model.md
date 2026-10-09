# 数据模型：类别字段可选继承

## 1. 新增选择表

迁移文件拟为 migrations/024_selective_field_inheritance.sql，实施前确认编号仍空闲。

```sql
CREATE TABLE category_field_selections (
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, field_id)
);
CREATE INDEX ix_category_field_selections_field
    ON category_field_selections(field_id, category_id);
```

- 行存在即表示明确选中，不设置 inherit_all 或 exclude 模式。
- 外键只能保证实体存在，不能保证字段属于直接父类有效集；领域变更服务负责后者，verify 负责检查存量。
- 根类别没有选择行，直接绑定字段不再重复存选择行。
- 不持久化 source_category_id、sort 或字段规则副本：来源、继承顺序来自父类的解析结果，自身字段顺序仍来自 category_fields.sort。
- 删除类别级联清理选择；删除字段的业务守卫必须先通过，不能把 FK cascade 当作允许删除的依据。

## 2. 迁移回填

在迁移事务内，按旧语义为每个非根类别插入它此前从所有严格祖先继承的 field_id，使用去重集合。父类与子类均回填，因此新解析器得到旧结果。

回填不改 category_fields、field_definitions、assets.attrs、category.display_key、asset_transfers 或现有唯一 scope。默认 search_suppressed=0 保留原有索引可搜索性。

测试应从旧版本结构构造数据再应用迁移，不能用已经默认不继承的新建 API 伪造旧库。验证三层、多个分支、字段排序、唯一来源和空树；如旧数据存在冲突，不自动重写定义或吞掉问题，报告并阻断上线验证。

下行迁移不能承诺无损：回到旧解析器意味着未选字段重新自动生效。实施提供明确拒绝不安全降级的策略和升级前备份恢复步骤，见 quickstart.md。

## 3. 历史唯一值搜索状态

```sql
ALTER TABLE asset_unique_values
    ADD COLUMN search_suppressed INTEGER NOT NULL DEFAULT 0
    CHECK (search_suppressed IN (0, 1));
```

保持现有部分唯一索引条件 archived_at IS NULL；有效唯一行必须 search_suppressed=0，领域写入及 verify 校验此不变量。

| 状态 | archived_at | search_suppressed | 占唯一槽 | 可搜 | 历史可查看 |
|---|---|---|---|---|---|
| 当前有效值 | 空 | 0 | 是 | 是 | 当前值 |
| 普通改号的旧值 | 非空 | 0 | 否 | 是 | 是 |
| 因继承撤回失效的值 | 非空 | 1 | 否 | 否 | 是 |

继承撤回作用于该资产、字段 key 的当前及历史行；若当前值改变或来源范围改变但字段仍有效，按对应值替换/范围更新规则处理，不能将“来源改变”误等同整段字段失效。

恢复产生新的当前行，不将原 suppressed 历史重置为 0。普通与精确搜索都加过滤；ValueHistory 仍读取历史行，不承担搜索决策。

## 4. 快照与解析实体（内存）

### SchemaSnapshot

包含类别关系与路径、字段定义、直接类别绑定、选择集合、型号及厂商关系和设备绑定。所有加载器接受统一 Querier，可使用一致读事务或当前写事务；不允许写事务中途回 ReadDB 读取另一版本。

解析以字段 ID 表示身份，同时保留 key 用于资产值读取。缓存每个类别的最终有效集和每个型号的设备字段集，返回 BoundField 时保留 InheritedFrom 为原始类别绑定来源；当前类别直接绑定时为空。

### CategoryDraft

包含现有类别可编辑属性，以及带 presence 的 inherited_field_ids。更新省略表示保留，[] 表示清空，null 非法；创建省略表示空。父级省略表示不动，null 表示变为根。编号字段、名称、打印配置沿用既有含义。

### FieldDelta

按 category_id + field_id 标识，类型为 added、removed、source_changed，保存 before_source、after_source。只改标签或草稿顺序不伪造字段新增撤回。受影响资产通过类别集合去重，不按字段逐次累加。

### ChangeImpact

包括各类型数量、受影响类别和字段、去重资产数、阻塞 issues、分页明细及确认凭据。内部保留完整有序影响集合，签名/指纹不能只覆盖当前可见页或数量。

### PreparedEffects

描述校验完成后的资产有效性变化、必要计算结果、唯一与搜索索引变更。归档属性不新增一份持久化 JSON；raw attrs 保留，读取按新 schema 切分。字段失效但 raw attrs 未变时也更新资产版本以阻止旧编辑覆盖。

### Prepared 的 schema 指纹

普通保存和导入准备结果携带相关 schema 的规范摘要，包含字段 ID、来源、规则与计算依赖、类别计算上下文、编号以及实际型号/厂商的默认值与上下文。摘要由一致快照生成；Persist 在写事务内先核验，不一致返回 schema_stale 并零写入。批量导入复用该事务的快照与核验缓存，避免逐行加载；新增资产同样受此保护。此摘要不是确认凭据，也不新增持久化 schema revision 表。

## 5. 约束与状态转换

- inherited selection 添加前必须证明字段在直接父类有效集中；直接绑定保持同链 key 与绑定模式约束。
- 上游撤回后递归裁剪失去来源的选择，遇到编号或计算依赖则整体拒绝；不能留下可自动复活的孤立选择。
- 同 ID 来源改变仍重新计算唯一 scope，并与所有最终 live claims 检查冲突。
- 恢复现存非空值执行类型、格式、范围等校验；无值的非计算必填字段沿用存量豁免，本次新增/变化的计算结果不得豁免。
- 计算依赖按最终 schema 校验，包括实际型号/厂商组合中受类别字段变化影响的表达式，不能只查类别表。
- 类别移动必须防树环、同步后代 path，并保留对子树已有资产的移动限制。
- 字段删除不因没有直接绑定而跳过归档值检查，不全库按 key 删除资产属性。
- Schema 变更事务不能与资产保存的旧 Prepared 状态竞态；实际持久化前必须验证准备数据使用的 schema 仍有效。

## 6. 事务与恢复

所有元数据、选择、索引、计算属性及受影响资产版本在单一 BEGIN IMMEDIATE 内提交。唯一 claims 批处理先释放所有需改变的 live claims，再写入完整新集合，避免合法范围交换因逐资产顺序误判；任一失败整个事务回滚。

不新增持有方、状态、负责人流转事件；资产 raw attrs 和派生数据变化沿用现有审计约定。预览无持久化写入，也不靠写事务后回滚伪装只读接口。
