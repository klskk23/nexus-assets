# Phase 1 · 数据模型

## 新增表：`model_fields`

```sql
CREATE TABLE model_fields (
  model_id TEXT NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES field_definitions(id),
  required INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (model_id, field_id)
);

-- 反向查：这个字段绑了哪些型号（字段列表页、解绑校验、唯一性范围计算都要用）
CREATE INDEX ix_model_fields_field ON model_fields(field_id);
```

结构与既有 `category_fields(category_id, field_id, required, sort)` 一一对应，
只把目标从类别换成型号。`ON DELETE CASCADE` 跟随型号删除，与
`product_model_categories` 的既有做法一致。

**不回填**：本轮之前不存在型号绑定，新表初始为空。

## 实体关系

```
field_definitions ──┬── category_fields ──── categories      （类别模式）
                    └── model_fields ─────── product_models  （型号模式）
                                                  │
                                    product_model_categories
                                                  │
                                             categories
```

**互斥不变量**（决策 96）：对任意 `field_id`，
`category_fields` 与 `model_fields` 中**至多有一张表**存在它的行。
这是应用层不变量，不做数据库约束——SQLite 无法跨表表达它，
而写路径已经是单写连接 + `BEGIN IMMEDIATE`，在事务里查一次另一张表即可。

## 结构变更：`BoundField`

`model.BoundField` 增加两项，其余不动：

| 新增项 | 含义 | 类别模式取值 |
|---|---|---|
| `ModelIDs []string` | 该字段绑到的型号 id 列表 | 空切片 |
| （沿用既有 `Required`、`Sort`） | 来自命中的那条绑定 | 不变 |

前端据 `ModelIDs` 判断显示列该不该解锁（决策 103），
以及录入表单该不该渲染这个字段（按资产的 `model_id` 是否在其中）。

## 唯一性：复用 `asset_unique_values`

表结构与索引**均不改**。变的只是 `scope_id` 这一列的取值来源：

| 字段绑定模式 | `scope_id` 取值 | 语义 |
|---|---|---|
| 类别模式（既有） | 类别 id | 该绑定所在类别的子树 |
| 型号模式（新增） | `f:<field_id>` | 该字段绑到的全部型号之并集 |

既有唯一索引 `ux_uv_live ON (scope_id, field_key, value) WHERE archived_at IS NULL`
直接适用于两种情况，无需新索引。

`f:` 前缀的作用是让排查数据的人一眼分清这一行的范围是「一个字段的型号集合」
还是「一个类别子树」——两者都是 UUID，不加前缀只能靠猜（见 research.md R2）。

## 有效字段集的解析口径

```
EffectiveFields(categoryID) =
    类别链解析（既有 Resolve，走 categories.path 的祖先链）
  ∪ 型号绑定解析（新增 resolveModelFields）
```

**型号绑定解析**：取「注册在这条类别链上的型号」（经 `product_model_categories`），
再取这些型号在 `model_fields` 里绑定的字段。全量加载后在内存取交集，不做按行查询。

**键冲突检查的范围随之扩大**：新绑一个字段时，要确认它即将覆盖到的资产范围内
没有别的字段占用同一个 `key`——
- 绑类别：查该类别的祖先链与整个子树（既有逻辑，不变）；
- 绑型号：查这些型号各自注册的类别链与子树。

理由是 `assets.attrs` 是扁平 map，两个不同字段定义抢同一个 key 在数据层面就是错的。

## 归档：`archived_attrs` 的新触发路径

`assets.archived_attrs` 的语义不变（「不再属于当前有效字段集的历史值」），
本轮只是多了一条进入它的路径：

| 触发源 | 何时 | 既有/新增 |
|---|---|---|
| 管理员解绑字段 | 解绑事务内 | 既有 |
| **资产的 `model_id` 变更** | 资产保存事务内 | **新增（决策 98）** |

判定：新旧型号各自的有效字段集之差中，`attrs` 里有值的键移入 `archived_attrs`。
不阻断型号变更本身。

## 不变的部分

- `field_definitions` 自身结构不变（键、显示名、类型、`is_unique`、`options`）。
- `product_models` 自身结构不变，`attr_defaults` 的语义不变
  （选型号时的一次性复制，与型号绑定字段是两件独立的事）。
- `assets` 结构不变，值仍在 `attrs`。
- `category_fields` 结构不变。
