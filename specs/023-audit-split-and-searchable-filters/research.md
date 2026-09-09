# Phase 0 调研：审计分栏、流转可查、筛选可搜

四个发现。第二个推翻了规格里的一条需求，第一个决定了新端点长什么样。

---

## 问题一：按「资产编号」筛选流转，SQL 里没有这一列

### 发现

`assets` 表**没有 `display_name` 列**。编号是 Go 里算出来的：
`model.AssetDisplayName(id, attrs, displayKey)` —— 取该资产 `attrs` 里由类别
`display_key` 指定的那个字段；类别没有指定的，退化成短 UUID。

所以「编号包含某片段」这个条件，**无法直接写成 `WHERE display_name LIKE ?`**。

### 三条路

| | 做法 | 判断 |
|---|---|---|
| A | 全部取出，在 Go 里算编号再过滤 | **否** —— 过滤发生在分页之后，`LIMIT/OFFSET` 就废了，总数也算不出 |
| B | 先在 Go 里把编号解析成一批 `asset_id`，再 `WHERE asset_id IN (...)` | 可行，但候选集大时 `IN` 会很长 |
| C | **复用资产列表搜索已经在用的那条子查询** | **采用** |

### C 是什么

资产列表的搜索（`internal/asset/query.go:414`）已经解决过同一个问题：

```sql
id IN (SELECT asset_id FROM asset_unique_values WHERE value LIKE ? OR value LIKE ?)
OR model_id IN (SELECT id FROM product_models WHERE name LIKE ?)
OR id LIKE ?
```

`asset_unique_values` 存着唯一字段的值，而编号字段几乎总是唯一字段 ——
**编号的原始值就在那张表里**。流转的筛选照抄这个形状即可：

```sql
asset_id IN (SELECT asset_id FROM asset_unique_values WHERE value LIKE ?)
OR asset_id LIKE ?
```

后半句管「类别没有指定编号字段、编号就是短 UUID」那种。

**大小写不敏感是白拿的**：SQLite 的 `LIKE` 对 ASCII 默认不区分大小写。
FR-012 因此不需要额外的 `LOWER()`，也不该加 —— 加了反而会让索引用不上。

### 显示编号仍要在 Go 里算

筛选在 SQL，**显示在 Go**：取回这一页的流转后，收集 `asset_id`，一次查出这些资产的
`attrs` 与 `category_id`，再用一张 `display_key` 表算出编号。这正是资产列表分页时
做的事（`query.go:121-130`「One map for the whole page rather than a lookup per row」），
照搬即可 —— 每页的语句数是常数，不随行数增长。

---

## 问题二：「资产删除后流转仍可读」做不到，因为那些行也删了

### 发现

```sql
asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE
```

**删掉一台资产，它的全部流转随之删除。** 规格的 FR-015 末句与 SC-005
（「某台设备已被删除，仍读得出它当时的编号」）**描述的是一个不存在的状态**。

我写规格时把它类比成了审计的 `TargetLabel`（「resolved at read time so a deleted
object still reads as something a person recognises」）—— 那个类比只对了一半：
审计条目不会随目标删除而消失，流转会。

### 结论：改规格，不改保留策略

让流转在资产删除后存活，要改外键、要把编号冗余存进流转行、还要想清楚「一个指向
不存在资产的流转」在界面上是什么。**那是一轮关于留存的改动，不是本轮的可查性改动。**

而且没有信息真的丢失：**资产的删除本身是一条操作审计**。两栏合起来仍然回答得了
「这台设备去哪了」—— 前一栏说它被谁删了，流转随它一起走。

FR-015 保留前半句（读取时携带可读标识），删去「删除后仍可读」；SC-005 整条删除。

---

## 问题三：权限迁移，比预想的简单

### 发现

角色权限存成 JSON 文本数组（`roles.permissions TEXT NOT NULL DEFAULT '[]'`），
SQLite 3.38 起 JSON 是内建的，modernc 的版本足够新。所以迁移可以精确表达，
不必做字符串替换：

```sql
UPDATE roles
   SET permissions = json_insert(permissions, '$[#]', 'transfer.audit')
 WHERE EXISTS (SELECT 1 FROM json_each(roles.permissions) WHERE value = 'audit.read')
   AND NOT EXISTS (SELECT 1 FROM json_each(roles.permissions) WHERE value = 'transfer.audit');
```

`NOT EXISTS` 那半句让它**可重复执行** —— 迁移跑两次不会塞两个。

### 管理员不需要迁移

`role-admin` 的 `permissions` 是 `[]`。章程写着「管理员是 `roles.is_admin` 这个标记，
不是十八个勾 —— 含义是**全部，包括以后新增的**」。所以新开关对管理员**自动生效**，
这正是当初那样设计的收益，本轮第一次兑现。

---

## 问题四：两栏必须是两条路由，不是一个页面里的两个页签

这个项目栽过一次，结论已成文（016 决策 107，记在 `docs/rules/web-tables.md`）：

> Its own route, not a tab inside `/models`：一个 CrudPage 会把搜索和页码写进地址，
> 两个挤在一个地址下会互相踩。

操作审计与流转审计**都**有筛选、**都**有分页、**都**写地址栏 —— 正是那个形状。

现成的解法也在仓库里：`MetadataTabs` 看起来是页签（`Tabs`/`TabsList`/`TabsTrigger`），
但每个触发器是通往不同路由的 `Link`。型号/厂商、字段/字段组已经这么用了两组。
本轮加第三组，零新机制。

---

## 顺带确认

- **`asset_transfers.kind`** 的取值是 `create|checkout|checkin|transfer|reassign|status_change`
  —— 六种，不是规格假设的「既有的五种流转动作」。`create` 是建档时写的那一条，
  它不是人做的「流转动作」，但它在表里。动作类型筛选要不要列出 `create`，
  在 plan 里定：**列出**，因为它确实是这台设备的第一条记录，藏起来会让时间线看着缺一段。
- **`actor_id` 有外键指向 `users`**，所以操作人筛选是一个干净的等值条件，
  且操作人被停用不影响历史（停用不是删除）。
