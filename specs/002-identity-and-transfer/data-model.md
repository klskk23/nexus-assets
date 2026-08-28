# Phase 1 数据模型：编号模型重构

**Feature**: 002-identity-and-transfer | **Date**: 2026-08-28

本文是 `specs/001-asset-ledger-demo/data-model.md` 的**增量**。未在此出现的表、状态机、
事件推导规则与不变量，全部沿用 001 且未被改动。

---

## 1. 实体增量

| 实体 | 表 | 变化 |
|------|----|------|
| 资产 | `assets` | **去掉 `sn` 列**。UUID 主键成为唯一标识；显示编号在读取时派生 |
| 类别 | `categories` | **去掉 `sn_template`，加上 `display_key`**。前者是一段模板，后者是一个 key 的选择 |
| 编号历史 | `asset_sn_history` | **删除**。职责由下面这张表承接 |
| 唯一值记录 | `asset_unique_values` | **新增**。`assets.attrs` 的派生物，由保存管线在同一事务内维护 |

其余六张表（`users`、`holder_entities`、`field_definitions`、`category_fields`、
`product_models`、`asset_transfers`、`audit_log`）结构不变。

---

## 2. DDL 增量

`migrations/002_identity.sql`。该迁移**不在事务内执行**（`-- +goose NO TRANSACTION`），
理由见 research.md D2。

```sql
PRAGMA foreign_keys = off;

DROP TABLE IF EXISTS asset_sn_history;
DROP INDEX IF EXISTS ix_assets_mac;      -- 职责由唯一值表接管

-- assets 走表重建：sn 带 UNIQUE 约束，SQLite 拒绝 DROP COLUMN
CREATE TABLE assets_new (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  model_id    TEXT REFERENCES product_models(id),
  status      TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  holder_type TEXT NOT NULL,
  holder_id   TEXT NOT NULL,
  attrs       TEXT NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
INSERT INTO assets_new (...) SELECT ... FROM assets;   -- sn 之外原样搬运
DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;               -- 最后才改名，见 D1
-- 重建 ix_assets_cat_status / ix_assets_owner / ix_assets_holder

-- categories 无约束，直接改列
ALTER TABLE categories DROP COLUMN sn_template;
ALTER TABLE categories ADD COLUMN display_key TEXT;

CREATE TABLE asset_unique_values (
  asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  field_key   TEXT NOT NULL,
  value       TEXT NOT NULL,
  archived_at TEXT,                       -- NULL 表示当前值
  created_at  TEXT NOT NULL
);

-- 唯一性从此是数据库级保证，不再依赖写入被串行化
CREATE UNIQUE INDEX ux_uv_live ON asset_unique_values(field_key, value)
  WHERE archived_at IS NULL;
CREATE INDEX ix_uv_value ON asset_unique_values(value);
CREATE INDEX ix_uv_asset ON asset_unique_values(asset_id);

PRAGMA foreign_keys = on;
```

Down 迁移必须把 001 的形态一字不差地还原：重建带 `sn` 的 `assets`（值取 UUID 前 8 位）、
恢复 `sn_template`、`asset_sn_history` 与 `ix_assets_mac`。

---

## 3. 显示编号的解析

不落库，读取时派生：

```
display_name(asset) =
    categories.display_key 非空
      且 attrs[display_key] 存在、非 null、trim 后非空
    ? attrs[display_key]
    : substr(assets.id, 1, 8)          -- UUID 第一段，八位十六进制
```

**不沿祖先链继承**（research.md D5）。类别自己没设就走回退，不看父类别。

配合下面三条约束，`display_key` 一旦设置就必定有值：

| 约束 | 出处 |
|------|------|
| `display_key` 指向的字段必须标为唯一 | FR-004 |
| 表达式键的静态依赖必须必填 | FR-016 |
| 表达式键求值失败回滚整次保存 | 001 的 FR-029 |

因此**回退只在「类别未设置 `display_key`」这一种情形下触发** —— 不存在「设了但为空」。
代码里仍然判空，因为判错的代价是列表首列空白。

---

## 4. 保存管线的变化

001 的十阶段收缩为九阶段。编号相关的两步消失，唯一性一步换了实现：

| | 001 | 002 |
|---|-----|-----|
| 1 | 解析有效字段集 | 不变 |
| 2 | 合并型号默认值 | 不变 |
| 3 | 归一化 | 不变 |
| 4 | 校验 | 不变 |
| 5 | 计算项求值（拓扑序） | 不变（改称表达式键） |
| 6 | **按 sn_template 求 SN** | **删除** |
| 7 | 唯一性校验（事务内 SELECT） | **改为探测 + DB 约束**，见下 |
| 8 | **归档旧 SN** | **归档旧唯一值**（全部唯一字段） |
| 9 | 乐观锁写入 | 不变 |
| 10 | 发出流转事件 | 不变 |

**顺序上的一处调整**：唯一性探测（给出可执行的错误）仍在写入之前，
但唯一值行的实际写入必须在 `assets` 行之后 —— `asset_unique_values.asset_id`
是外键，行不存在则插不进去。

**「归一化必须早于唯一性」这条硬规则不变** —— 它是 `AA:BB:CC` 与 `aa-bb-cc` 被判为
同一个 MAC 的唯一保障。

**资产 ID 提前到 `Prepare` 阶段分配**（001 中在写入时才生成）。这样表达式键可以读
`{{ .id }}` —— 在没有独立编号列之后，用 UUID 拼一个短标签是很自然的需求。
UUID 随机生成，提前分配不造成任何稀缺。

---

## 5. 唯一值表的维护规则

设 `want` = 本次保存后，该资产在全部唯一字段上的非空取值集合。

| 情形 | 动作 |
|------|------|
| `want[k]` 与库中在用行相同 | 不动 |
| 库中在用行的值与 `want[k]` 不同，或该 key 已不在 `want` 中 | 该行 `archived_at` 置为当前时间 |
| `want[k]` 在库中没有对应的在用行 | 插入一行，`archived_at` 为 NULL |
| 插入违反 `ux_uv_live` | 整个事务回滚 |

**空值不占用唯一性**：某个唯一字段没填、或填了空白，不产生行。否则一批还没填资产标签的
设备会在空字符串上互相冲突。

**删除资产时显式删除其唯一值行**（外键的 `ON DELETE CASCADE` 也会做，显式写出与 001 的
删除流程保持同一形态）。

---

## 6. 校验规则增量

### 类别

| 规则 | 来源 |
|------|------|
| `display_key` 若非空，必须是该类别有效字段集内的 key | FR-003 |
| 该字段必须未停用 | FR-003 |
| 该字段必须 `is_unique = 1` | FR-004 |

### 绑定（`category_fields` 的写入）

判定对象是**递归依赖闭包**：从待绑定的表达式键出发，沿模板引用递归展开，
遇到表达式键继续下钻，直到只剩静态键。环在此处报出。

| 规则 | 来源 |
|------|------|
| 闭包中的每个 key 必须存在于信息项库 | FR-016 |
| 闭包中的每个 key 必须已在该类别的有效字段集内（含继承） | FR-016 |
| 闭包中的**静态键**必须已标为 `required = 1` | FR-016 |
| 表达式键之间不得成环 | FR-019 |
| 被拒绝时须分类列出：库中不存在 / 尚未绑定 / 需要改必填 | FR-017 |

表达式键自身不受「必须必填」约束 —— 它的依赖在它被绑定时已经检查过了。

### 解绑与停用

| 操作 | 拦截条件 | 来源 |
|------|----------|------|
| 从类别解绑信息项 | 该类别链或子树上有表达式键的闭包含它 | FR-018 |
| 从类别解绑信息项 | 该类别链或子树上有类别以它为 `display_key` | FR-018 |
| 停用信息项 | 任一表达式键的闭包含它 | 001 FR-031 |
| 停用信息项 | 任一类别以它为 `display_key` | FR-018（新增） |

「该类别链或子树」的取值范围与 001 绑定时的 key 冲突检查一致 ——
那正是有效字段集包含这条绑定的全部类别。

### 修改表达式键的模板

对该字段已绑定的**每一个**类别重跑绑定门禁（FR-020）。
检查必须在 `UPDATE` 语句之后执行，靠事务回滚拒绝 —— 在之前执行读到的是旧模板。

---

## 7. 检索

精确匹配按顺序探测，任一阶段命中恰好一条即返回；命中多条即停止跳转：

1. `asset_unique_values` 中 `archived_at IS NULL` 且 `value` 等于原串或规范化串
2. 同表 `archived_at IS NOT NULL` 的同样条件
3. `assets.id` 全值相等

规范化与录入时一致（去除 `:`、`-`、`.`、空格并转大写），使扫码枪的输出格式不影响命中。

未精确命中时的子串匹配范围：唯一值表的任一 `value`、型号名、UUID 前缀。

---

## 8. 关键不变量

在 001 的不变量之上新增或改写：

| # | 不变量 | 检查方式 |
|---|--------|----------|
| N1 | 每台资产都有一个可指代的名字 | `display_name` 的回退保证其非空 |
| N2 | 同一个唯一字段上，任一取值最多被一台在用资产持有 | `ux_uv_live` 部分唯一索引 |
| N3 | `asset_unique_values` 的在用行与 `assets.attrs` 一致 | `nexus verify` 双向对帐 |
| N4 | 每个唯一字段上的非空取值都有一条在用行 | `nexus verify` 反向扫描 |
| N5 | 类别的 `display_key` 若非空，必指向一个已绑定且唯一的活跃字段 | 写入时校验 |
| N6 | 任一已绑定的表达式键，其闭包在该类别上都可求值 | 三方向门禁 |
| ~~SN 全表唯一~~ | 001 的不变量，随 `sn` 列一并移除 | —— |

**N3 与 N4 是本特性引入的新风险**：`asset_unique_values` 是派生数据，
任何绕过保存管线直接写 `assets` 的代码路径都会让它漂移，而漂移不会立刻表现出来。
`nexus verify` 的两条扫描分别对应两个方向：

- 在用行的 `value` 与 `json_extract(attrs, '$.' || field_key)` 不等
- 某个唯一字段有非空取值，却没有对应的在用行

第二条比第一条更隐蔽：它意味着那个值既搜不到，也不占用唯一性 ——
另一台设备可以合法地把它抢走。
