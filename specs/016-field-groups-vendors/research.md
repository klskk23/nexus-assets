# 调研：字段组与厂商实体

三个问题必须在写计划之前有答案，因为它们各自都能把方案推翻。

## 一、SQLite 支不支持表达式唯一索引？

**结论：支持，且语义正是我们要的。** 在本项目用的 modernc 纯 Go 驱动上实测：

```sql
CREATE TABLE m(id TEXT PRIMARY KEY, vendor_id TEXT, name TEXT NOT NULL);
CREATE UNIQUE INDEX ux ON m(ifnull(vendor_id,''), name);
```

| 插入 | 结果 |
|---|---|
| 两行都是 `vendor_id = NULL` 且同名 | **拒绝** — `UNIQUE constraint failed: index 'ux'` |
| 一行有厂商、一行没有，同名 | 允许 |

第一行正是关键：普通的 `UNIQUE(vendor_id, name)` 会放行，因为 SQLite 把 NULL 当彼此不同 ——
这正是迁移 003 当年把 `vendor` 改成 `NOT NULL DEFAULT ''` 要躲的坑。
`ifnull()` 把所有「没有厂商」折叠成同一个值，坑就填上了，
而且不必造一个假的「未指定厂商」实体。

**备选方案与否决理由**：加一个哨兵厂商行让 `vendor_id NOT NULL` 成立 ——
否决，因为那一行会出现在厂商列表里、能被绑字段（「给所有没厂商的型号加字段」语义诡异），
而且迟早有人删掉它。

## 二、`vendor` 今天有多少地方在读？

一次全量搜索，Go 侧 16 个文件、前端 10 个文件。绝大多数只是把它当型号的一个展示属性
（列表列、下拉框标签、导出列、打印数据源的一列），改成实体之后照样是一个字符串。

**但有一处会咬人，必须单独说：**

```go
// internal/compute/eval.go:34
"vendor": modelVendor,
```

**表达式引擎把 `model.vendor` 暴露给了计算字段。** 也就是说，某个类别的资产编号
完全可能是从厂商名推导出来的。如果实体化之后 `model.vendor` 变成了 id、或者变成空，
那么：

- 已有的编号表达式会算出**不同的值**，而 015 的「改表达式即重算」不会被触发 ——
  因为表达式本身没变，变的是它读到的东西
- 更糟的情况是它静默返回空串，拼进编号里没人发现

**因此这是一条硬要求：`model.vendor` 在表达式里 MUST 继续解析为厂商的名字（字符串）。**
`internal/asset/recompute.go` 的 `modelOf` 返回 `(name, vendor)` 同理。
本轮必须有一条测试盯着「实体化前后，同一个读 `model.vendor` 的表达式算出同一个值」。

## 三、有效字段集今天怎么合成，厂商这一层插在哪？

`EffectiveFields(categoryID)` → `FieldsOfPath(path)`，里面两步：

1. `BindingsByCategory()` 全量加载类别绑定 → `Resolve(path, ...)` 沿祖先链取并集
2. `ModelBindingsByModel()` 全量加载型号绑定 → `resolveModelFields(...)` 取「注册在这条链上的型号」的绑定

两步都是**全量加载后在内存里合成**，这是章程明令的（禁止按行查询）。

**厂商层就插在第二步里**：再全量加载一次「厂商 → 字段」与「厂商 → 旗下型号」，
把厂商绑定的字段按型号摊开，与型号自己的绑定合并去重，然后照原样填 `ModelIDs`。
这样 `Resolve` 的出参形状不变，`ForModel` / `AppliesTo` 不用动 —— 决策 113 的接口形状
正是为了让这一点成立。

**查询数**：每次解析多两条全量查询，与既有的两条同数量级，仍是常数条，不随型号数增长。

## 四、组要不要新的解析逻辑？

**不要。** 决策 105 让组在绑定动作里就展开成既有的绑定行。
`field_groups` / `field_group_members` 两张表只被「绑定」这个动作和字段页的筛选读，
解析路径一行不碰它们。这是选择展开方案换来的最大好处，也是它唯一的代价
（往组里加字段不回溯）的来源。
