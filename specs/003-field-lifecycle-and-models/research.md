# Phase 0 研究：实现级决策

**Feature**: 003-field-lifecycle-and-models | **Date**: 2026-08-30

Technical Context 中没有 NEEDS CLARIFICATION —— 技术选型沿用 001/002，无新增依赖。
本文解决的是决策之下、编码之上的一层：**落地时必须先想清楚、否则会在实现中途卡住
或被静默做错的地方。**

---

## D1. 「有没有人填过这个字段」怎么判定

**Decision**: 一次全表扫描：
`SELECT id FROM assets WHERE coalesce(trim(json_extract(attrs, '$.' || ?)), '') != '' LIMIT n+1`，
外加一条 `count(*)`。取前 n 台用于报错，总数用于「共 N 台」。

**Rationale**: 三个约束叠在一起，排除了所有更便宜的做法：

- `attrs` 是 JSON 列，key 是运行时可配的 —— 参数化的 `json_extract` 路径用不上表达式索引
- 判定必须是**精确**的。漏判一台就意味着删除会丢数据，而删除不可撤销
- 唯一值反查表（v2 决策 32）只覆盖标为唯一的字段，回答不了普通字段的问题

`trim` 后判空而不是判 `IS NOT NULL`：空串与空白串不算「填过」，
否则一个曾经被打开又清空的字段会永远删不掉。

**Alternatives considered**:
- 只看绑定关系 —— 便宜，但拦住的正是「建错了想删」这个要解决的场景。
- 维护一张「字段 → 已使用」的计数表 —— 又一份需要与 `attrs` 对帐的派生数据。
  v2 已经因为 `asset_unique_values` 加了一项 verify 检查；为一个低频操作再加一份不划算。

**验证**: 待实现后由 `internal/schema` 包内用例覆盖：无资产 / 有空值 / 有非空值 三种情形。

---

## D2. 移除 `archived_at` 之后，哪些东西跟着变

**Decision**: 逐一清点，避免留下半截机制：

| 位置 | 处置 |
|------|------|
| `field_definitions.archived_at` 列 | 删除（表重建） |
| `ArchiveField()` | 改为 `DeleteField()`，引用检查搬过来 |
| `UpdateFieldInput.Archive` | 删除 |
| `ActiveFields()` | **保留但退化为恒等** —— 见下 |
| `loadLibrary` / `loadChain` 的 `archived_at IS NULL` 过滤 | 删除 |
| `FieldDefinition.ArchivedAt` | 删除 |
| 前端「停用」按钮与 `archiveBlocked` 文案 | 改为「删除」 |
| `archived_attrs` / `SplitAttrs` | **不动** |

**Rationale**: 最后两行是关键，容易搞混。

`archived_attrs` 装的是**孤儿键** —— 由「解绑」产生，不是由「停用」产生。
解绑机制原封不动，因此这一套必须保留。v1 决策 22 讲的就是它。

`ActiveFields()` 的每个调用点都在表达「取该类别当前生效的字段」。
移除停用后它确实退化成恒等函数，但**保留这个调用点**：
一旦以后再引入某种「不生效」的字段状态，它是唯一正确的挂载位置。
删掉它意味着届时要把语义重新散布到十几个调用点上。

**Alternatives considered**:
- 连 `ActiveFields()` 一起删掉 —— 少一层间接，但把一个概念挂载点也删了。
- 保留 `archived_at` 列不再暴露 —— 一个没有入口的列会让下一个人困惑，
  且存量已停用字段永远卡在那个状态。

**验证**: 待实现后由编译与既有用例覆盖；`archived_attrs` 的行为由 001 的既有用例保护。

---

## D3. 为什么持有方与账号不跟着改

**Decision**: 只有信息项改为可删除。持有方实体与账号维持「只停用」。

**Rationale**: 表面上这违反章程原则 III 的一致性 —— 同一个系统里三类元数据两种下线方式。
但三者的约束来源根本不同：

| | 删掉之后会发生什么 |
|---|---|
| 信息项 | 无事发生。它是纯配置，历史记录里不引用它 |
| 持有方实体 | 流转历史的 `from_holder_id` / `to_holder_id` 按 id 存了它。删掉之后时间线上会出现一串无法解释的 id |
| 账号 | 被 `asset_transfers.actor_id` **外键**引用。数据库层面就删不掉 |

给账号一个永远会被拒绝的删除按钮，比不给这个按钮更糟。

**这条理由必须写进规格**（FR-009）。不写的话，下一个人看到「信息项能删、另两个不能」
的第一反应是漏改，然后花时间去「修」一个不是缺陷的东西。

**Alternatives considered**:
- 三者全改 —— 账号那条永远失败，持有方那条会破坏历史可读性。
- 三者都不改 —— 就是本特性要解决的问题。

---

## D4. 型号多对多的迁移路径

**Decision**: `product_models` 表重建（去 `category_id`、`vendor` 改 `NOT NULL DEFAULT ''`、
`UNIQUE(vendor, name)`），新建 `product_model_categories` 并把原有的 `category_id`
搬进去作为唯一一条关联。

**Rationale**: 三处必须一起改，分开做会经过一个非法中间状态：

- 去掉 `category_id` 的同时，`UNIQUE(category_id, name)` 必须换掉，否则约束引用一个不存在的列
- 换成 `UNIQUE(vendor, name)` 就必须让 `vendor` 非空 —— **SQLite 的 UNIQUE 把 NULL 视为
  互不相等**，两个 `vendor IS NULL` 的同名型号都能插进去，约束等于不存在。
  这是本轮最容易被静默做错的一处：约束写上去了，看起来生效了，实际上没有

存量数据迁移是无损的：每个型号原来的 `category_id` 变成关联表里的一行。

**Alternatives considered**:
- 保留 `category_id` 作为「主类别」，关联表放附加类别 —— 两个真相来源，
  查询时要合并，且「主」的语义没有任何业务含义。
- `UNIQUE(name)` —— 两家厂商都有 X100 时要手动加前缀。型号本来就活在厂商命名空间里。

**验证**: 待实现后由迁移的 up/down 往返用例覆盖，并断言 `vendor IS NULL` 的存量行被搬成 `''`。

---

## D5. 型号候选范围与 `attr_defaults` 的键错位

**Decision**: 候选 = 关联到本类别**或其任一祖先**的型号。
`attr_defaults` 套用时只填当前类别有效字段集内的键，其余静默跳过。

**Rationale**: 候选范围沿用字段继承的心智模型 —— 关联在「网络设备」上的型号，
它的子类也能选。反方向不成立：关联在子类上的型号，父类看不见。
有了多对多之后，想让某个子类单独可选，显式关联上去即可，不必靠推断。

键错位不做校验，是因为**默认值是「能填则填」，不是承诺**。
在关联类别时要求键必须存在，等于逼管理员为了共享一个型号先去对齐两个类别的字段集 ——
而那两个类别本来就是不同的东西，字段集不同是正常的。

这与 v2 决策 34（绑定表达式键时严格校验依赖）看似矛盾，实则不同：
表达式键求不出值会**阻止保存**，默认值填不上只是少填一格。
严格程度应当匹配失败的代价。

**Alternatives considered**:
- 候选只取精确关联 —— 深层类别树下要逐个关联，重复劳动。
- 候选含子孙 —— 方向上不对称，且父类的下拉会被整个子树的型号淹没。
- 关联时校验键存在 —— 如上，把一个宽松机制变严格，收益为负。

---

## D6. 解绑端点的形状

**Decision**: `DELETE /api/categories/:id/bindings/:field_id`，无请求体，成功返回 204。
界面上用 `AlertDialog` 二次确认，说明存量值会保留为只读。

**Rationale**: 绑定是 `POST /categories/:id/bindings`（请求体带 `field_id`），
解绑做成同一资源下的 `DELETE` 是 REST 的直接读法。
把 `field_id` 放路径而不是请求体：`DELETE` 带请求体在各层代理与客户端上支持参差。

**二次确认是必要的**，尽管解绑不删数据：解绑之后新录入的表单就不再有这一项了，
而恢复它需要重新绑定并逐台补值。这在章程原则 III「破坏性操作必须经过二次确认」的范围内。

护栏已经存在（v2 决策 37 加的 `checkUnbindSafe`），本轮只是给它接上调用者 ——
一个写好、测过、却从来没有被调用过的守卫。

**Alternatives considered**:
- `PATCH /categories/:id/bindings` 传全量列表 —— 幂等且能一次改多项，
  但会把「解绑」这个有护栏的动作和「调整排序」这种无害动作混在一个端点里。
- 不做二次确认 —— 与既有的删除资产、停用持有方的处置不一致。
