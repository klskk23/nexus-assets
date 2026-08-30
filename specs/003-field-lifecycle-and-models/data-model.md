# Phase 1 数据模型：信息项生命周期与型号归属

**Feature**: 003-field-lifecycle-and-models | **Date**: 2026-08-30

本文是 001 与 002 的 data-model 的**增量**。未在此出现的表、状态机、管线与不变量
全部沿用且未被改动。

---

## 1. 实体增量

| 实体 | 表 | 变化 |
|------|----|------|
| 信息项定义 | `field_definitions` | **去掉 `archived_at`**。停用这个状态不复存在 |
| 型号 | `product_models` | **去掉 `category_id`**；`vendor` 改 `NOT NULL DEFAULT ''`；重名约束改为 `UNIQUE(vendor, name)` |
| 型号类别关联 | `product_model_categories` | **新增**。型号可出现在哪些类别的录入表单里 |

其余表结构不变。

---

## 2. DDL 增量

`migrations/003_field_lifecycle.sql`，`-- +goose NO TRANSACTION`（同 002，理由见 research.md D4）。

```sql
PRAGMA foreign_keys = off;

-- field_definitions：去掉 archived_at
CREATE TABLE field_definitions_new (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,
  options     TEXT NOT NULL DEFAULT '{}',
  is_unique   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
INSERT INTO field_definitions_new
  SELECT id, key, label, type, options, is_unique, created_at, updated_at
  FROM field_definitions;
DROP TABLE field_definitions;
ALTER TABLE field_definitions_new RENAME TO field_definitions;

-- product_models：去掉 category_id，vendor 非空，重名规则改厂商 + 名称
CREATE TABLE product_models_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  vendor        TEXT NOT NULL DEFAULT '',   -- 参与唯一约束，必须非空
  image_url     TEXT,
  attr_defaults TEXT NOT NULL DEFAULT '{}',
  archived_at   TEXT,                       -- 型号仍可停用，与信息项不同
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(vendor, name)
);
INSERT INTO product_models_new
  SELECT id, name, coalesce(vendor, ''), image_url, attr_defaults,
         archived_at, created_at, updated_at
  FROM product_models;

CREATE TABLE product_model_categories (
  model_id    TEXT NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (model_id, category_id)
);
-- 存量的单值归属搬进关联表，无损
INSERT INTO product_model_categories (model_id, category_id)
  SELECT id, category_id FROM product_models;

DROP TABLE product_models;
ALTER TABLE product_models_new RENAME TO product_models;

CREATE INDEX ix_pmc_category ON product_model_categories(category_id);

PRAGMA foreign_keys = on;
```

Down 迁移还原 002 后的形态：恢复 `archived_at` 列（全部为 NULL），
把关联表里**任取一条**关联写回 `category_id`，恢复 `UNIQUE(category_id, name)`。
多对多降回单值必然有损，Down 只保证 schema 可回滚，不保证关联信息无损。

> 型号仍保留 `archived_at`。**只有信息项移除了停用**（决策 41）——
> 型号的停用是为了让一款停产设备不再出现在下拉里，同时保留存量资产上的引用，
> 与信息项的情形不同。

---

## 3. 删除信息项的判定

三条拦截线，按代价从低到高排列，先命中先返回：

| # | 拦截 | 判定 | 来源 |
|---|------|------|------|
| 1 | 被表达式键读取 | 任一表达式键的依赖闭包含它 | FR-004 |
| 2 | 被选作显示编号 | 任一类别的 `display_key` 等于它 | FR-004 |
| 3 | 有资产填了非空值 | 全表扫描 `attrs` | FR-002 |

第 3 条的判定：

```sql
SELECT count(*) FROM assets
WHERE coalesce(trim(json_extract(attrs, '$.' || ?)), '') != ''
```

`trim` 后判空而不是判 `IS NOT NULL`：曾经被打开又清空的字段不算「填过」，
否则它会永远删不掉。

拦截 1、2 复用 v2 已有的 `ReferrersOf` 与 `categoriesUsingDisplayKey` ——
它们此前挂在停用路径上，本轮整体搬到删除路径。

删除成功时，同一事务内执行三件事：

1. `DELETE FROM category_fields WHERE field_id = ?` —— 移除全部绑定
2. `UPDATE assets SET attrs = json_remove(attrs, '$.' || ?)` —— 清掉残留键
   （按拦截线，能走到这里的只会是空值残渣）
3. `DELETE FROM field_definitions WHERE id = ?`

---

## 4. 型号候选的解析

给定资产所属类别的 `path`，候选型号为：

```sql
SELECT DISTINCT m.* FROM product_models m
JOIN product_model_categories pmc ON pmc.model_id = m.id
JOIN categories c ON c.id = pmc.category_id
WHERE ? LIKE c.path || '%'          -- c 是该类别或其祖先
  AND m.archived_at IS NULL
```

`? LIKE c.path || '%'` 是 001 就在用的祖先链判定（`categories.path` 是物化路径）。
方向是单向的：关联在祖先上的型号向下可见，关联在子孙上的型号向上不可见（决策 50）。

**默认值套用**：取型号的 `attr_defaults`，只保留当前类别有效字段集内的 key，其余丢弃。
不报错、不提示 —— 默认值是「能填则填」，不是承诺（research.md D5）。

---

## 5. 校验规则增量

### 信息项

| 规则 | 来源 |
|------|------|
| 删除时，被任一表达式键读取 → 拒绝 | FR-004 |
| 删除时，被任一类别选作显示编号 → 拒绝 | FR-004 |
| 删除时，任一资产在该 key 上有非空值 → 拒绝，报出前若干台与总数 | FR-002、FR-003 |
| ~~停用时的引用检查~~ | 随停用一并移除 |

### 型号

| 规则 | 来源 |
|------|------|
| `(vendor, name)` 全局唯一；`vendor` 为空串时仍参与判定 | FR-011 |
| 关联的类别必须存在 | 外键 |
| `attr_defaults` 的键不做存在性校验 | FR-015、research.md D5 |

### 解绑

沿用 v2 的 `checkUnbindSafe`，不做改动。本轮只是给它接上 HTTP 调用者。

---

## 6. 关键不变量

在 001/002 的不变量之上：

| # | 不变量 | 检查方式 |
|---|--------|----------|
| N1 | 信息项被删除后，库中不存在该 key 的任何痕迹 | 删除事务的三步 |
| N2 | 有数据的信息项永远不会被删除 | 拦截线 3 |
| N3 | 同一厂商下不存在两个同名型号 | `UNIQUE(vendor, name)` + `vendor NOT NULL` |
| N4 | 型号至少出现在它关联的类别及其子孙的录入表单中 | 候选解析的 `LIKE` 判定 |
| ~~信息项只停用不删除~~ | 001 的不变量，本轮推翻 | —— |

**N3 依赖 `vendor NOT NULL`**，这一点值得单独记住：如果哪天有人把 `vendor` 改回可空，
约束会**静默失效** —— SQLite 允许任意多行 `(NULL, 'X100')` 共存，而表结构看上去仍有 UNIQUE。
