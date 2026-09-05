# 数据模型：字段组与厂商实体

迁移 **019**。三张新表，一张表改列，一个索引换成表达式索引。

## 新表

### `vendors`

```sql
CREATE TABLE vendors (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

名字全局唯一。没有「停用」——与持有方、状态同一条规则：只有删除，有型号引用时拒绝。

### `field_groups` / `field_group_members`

```sql
CREATE TABLE field_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE field_group_members (
  group_id TEXT NOT NULL REFERENCES field_groups(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  sort     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, field_id)
);
```

两处 `ON DELETE CASCADE` 都是对的，而且要和 017 的教训对照着看：
`model_fields.field_id` 当年**没有**加级联，结果删除一个绑了型号的字段直接 500
（v0.8.3 修的就是它）。成员关系不是需要守护的数据 —— 组丢了成员或字段丢了组籍，
都不损失任何用户填过的东西，所以级联删除是正确的，与绑定表不同。

### `vendor_fields`

```sql
CREATE TABLE vendor_fields (
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  field_id  TEXT NOT NULL REFERENCES field_definitions(id),
  sort      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vendor_id, field_id)
);
CREATE INDEX ix_vendor_fields_field ON vendor_fields(field_id);
```

形状照抄 `model_fields`（017），有意为之：绑定就是绑定，三张形状一样的表让
「这个字段是不是在别处绑着」变成同一个问题问三遍，而不是三个特例。

**`field_id` 上不加级联，但删除字段时必须显式删这张表的行** ——
这正是 v0.8.3 那个 500 的成因，同一个坑不踩第二次。

## 改动既有表

### `product_models`

```sql
ALTER TABLE product_models ADD COLUMN vendor_id TEXT REFERENCES vendors(id);
```

回填：每个不同的 `vendor` 字符串建一个厂商，型号指过去；`vendor = ''` 的型号
`vendor_id` 留 NULL。**不做任何归并或大小写规范化**（决策 109）。

旧的 `vendor` 文本列**保留不删**。三个理由：down 迁移要靠它还原；
SQLite 删列要整表重建而这张表被 `product_model_categories`、`assets`、`model_fields` 指着；
以及它是回填出了问题时唯一的对照。**但 019 之后没有任何代码再读它**。

### 唯一约束

```sql
DROP INDEX IF EXISTS <既有的 UNIQUE(vendor, name)>;
CREATE UNIQUE INDEX ux_models_vendor_name ON product_models(ifnull(vendor_id,''), name);
```

实测可行（见 research.md 第一节）。`ifnull` 把「没有厂商」折叠成同一个值，
所以两台都没厂商的同名型号仍然被拒 —— 迁移 003 修的那个 bug 不会回来。

**回填与建索引的顺序有硬性要求**：先回填 `vendor_id`，再建唯一索引。
反过来会在含大小写不一致数据的库上失败。而因为回填不归并，
`(ifnull(vendor_id,''), name)` 与旧的 `(vendor, name)` 是一一对应的，
所以索引一定能建成功 —— 这是「按原样迁移」除了尊重意图之外的第二个理由。

## 派生的读取语义

不落表、由解析计算：

- **型号的有效字段** = `model_fields[model] ∪ vendor_fields[model.vendor_id]`
- **字段的到达集**（接口里的 `model_ids`）= 直接绑定的型号 ∪ 所绑厂商旗下的全部型号
- **字段的绑定模式** = `category`（`category_fields` 有行）/ `device`（`model_fields` 或
  `vendor_fields` 有行）/ `unbound`
- **唯一性范围** 仍是 `f:<field_id>`，覆盖集合随到达集扩大 —— **scope_id 的取值不变**，
  所以 `asset_unique_values` 一行不用迁移

## 互斥的判定

绑定前查另一侧：

| 要绑到 | 必须检查 |
|---|---|
| 类别 | `model_fields` 或 `vendor_fields` 里有没有这个 field_id |
| 型号 | `category_fields` 里有没有 |
| 厂商 | `category_fields` 里有没有 |

型号与厂商之间**不互查** —— 它们同属设备侧，可以并存（决策 110）。
