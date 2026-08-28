# Nexus Assets 设计基线 v0

SDWAN 路由设备的资产台账与流转记录系统。本文记录第一版 demo 全部已敲定的设计决策、数据库 schema、字段契约、演化规则与已知风险 —— 每条决策都附上它的代价。

| | |
|---|---|
| 后端 | Go · Gin · SQLite(modernc, 纯 Go 无 CGO) · goose |
| 前端 | React · Tailwind · shadcn/ui · TanStack Query |
| 认证 | Google OIDC + 本地用户 |
| 交付形态 | 单二进制（Go embed 前端） |
| 日期 | 2026-08-27 |

**目录**

1. [决策清单](#1-决策清单)
2. [数据库 Schema](#2-数据库-schema)
3. [字段类型契约](#3-字段类型契约)
4. [资产保存管线](#4-资产保存管线)
5. [元数据变更规则](#5-元数据变更规则)
6. [前端信息架构](#6-前端信息架构)
7. [CSV 导入](#7-csv-导入)
8. [API 表面](#8-api-表面)
9. [工程约定](#9-工程约定)
10. [已知风险](#10-已知风险)
11. [Demo 范围](#11-demo-范围)

---

## 1. 决策清单

按依赖顺序排列 —— 后一条的形状取决于前一条。编号即讨论顺序，也是实现顺序。前十条定结构，后十条定它在时间里怎么演化、怎么交付。

### 结构 · 01–10

**01 · 资产粒度 — 纯单台制**
一条资产记录 = 一台可唯一识别的物理设备，无数量字段。
*代价*：线缆、SFP 模块这类按数量管理的耗材要么不进系统，要么一根一条记录。

**02 · 型号建模 — 独立实体表**
`product_models` 挂在类别下，含厂商、图片与自定义字段默认值；资产引用 `model_id`。「X100 我们有多少台」是一句 SQL。

**03 · SN 生成 — MAC 全 48 位转十进制**
`00:1A:2B:3C:4D:5E` → `112394521950`，写入 `assets.sn`；MAC 变更时重算，旧编号归档进 `asset_sn_history` 作为可搜索别名。
*代价*：基准 MAC 必须必填且全局唯一，否则 SN 唯一性无从保证。

**04 · 字段值存储 — JSON 列 + 应用层唯一校验**
值全部落在 `assets.attrs`，一行即一台完整资产。唯一性在事务内校验 —— SQLite 写操作全局串行，这个做法在 SQLite 下是可靠的。
*迁移警告*：换 Postgres 时该前提失效，必须改为数据库级约束。

**05 · 字段定义归属 — 全局字段库 + 类别绑定**
既然唯一性按字段名全局匹配、子类不可覆盖、值共用一个 `attrs` 命名空间，同名字段就必须全局同义。`field_definitions` 持有定义，`category_fields` 只管绑定与必填。

**06 · 类别继承 — 树形 · 只追加不覆盖**
有效字段集 = 祖先链上所有绑定的并集，字段名冲突在绑定时即拒绝。资产可挂任意层级。
*代价*：列表页按类别筛选需要一个「含子类别」开关，统计口径要写清。

**07 · 模板引擎 — text/template + 函数白名单**
Go 标准库，零依赖，语法即 `{{ }}`，天然支持管道。computed 可引用 computed，字段定义保存时做 DAG 环检测。求值失败阻止保存。
*代价*：没有 MAC 就无法入库，连草稿都存不了 —— 批量导入时缺 MAC 的行是硬失败。

**08 · 流转模型 — 事件表 + 物化快照**
owner 与 holder 完全正交，owner 始终必填；五态 `in_stock / in_use / in_repair / lost / retired`；事件记全量前后值，批量流转共享 `batch_id`。
*代价*：两份数据存在漂移风险 —— 配 `verify` 命令重放事件对帐。

**09 · 持有方多态 — users + 单张 holder_entities**
公司 / 位置 / 部门共表，`type` 区分、`parent_id` 支持层级、`attrs` 承载类型专属字段。加一种新持有方类型 = 加一个枚举值，零代码。
*代价*：`(holder_type, holder_id)` 无法建外键，引用完整性靠应用层。

**10 · 认证 — 域名白名单 + JWT 8h**
域内邮箱首次 OIDC 登录自动建号，域外拒绝。不做权限区分，但 `users.role` 与 `users.token_version` 两列现在就留好。
*代价*：JWT 无法即时吊销 —— 停用一个用户后他最多还能用 8 小时。

### 演化与交付 · 11–21

**11 · 引用完整性 — 有引用则拒绝停用**
全系统一套规则，覆盖三处：停用被 computed 模板引用的字段、停用被 reference 指向的对象、删除被资产持有的 holder_entity。堵住了「停用 `mac` 导致全库永久无法保存」这个自锁 bug。

**12 · SN 规则变更 — 显式重算 · 先预览后执行**
改模板只影响后续求值；另有独立的「重算存量」动作，干跑展示影响台数与冲突对，确认后单事务执行。
*冲突处理*：任一唯一性冲突即整体回滚并输出冲突清单，绝不留半新半旧的库。

**13 · 类别移动 — 有资产时禁止移动节点**
被禁的只是类别节点的 `parent_id` 变更；**资产自身改 `category_id` 仍然允许**，走完整保存管线。配「批量改类别」动作作为逃生舱：建新类别 → 批量迁资产 → 旧类别清空后即可移动或停用。

**14 · reference 目标 — 用户 + holder_entities**
能表达「安装位置」「采购负责人」。
*代价*：不引入资产间引用，「上联交换机」「所属机柜」这类关系本版只能写成自由文本 —— 换来图结构完全扭开，无环引用与级联删除问题。

**15 · SN 模板归属 — categories.sn_template**
固定列配固定来源。子类未设则沿父链向上找第一个非空值，与字段继承同一套解析逻辑。「重算」的触发点与审计边界都落在类别上，清晰可查。

**16 · enum 选项变更 — 旧值保留 · 标为已废弃**
删掉的选项在存量资产上仍显示并可筛选，下拉里置灰不可新选，下次编辑该资产时提示更换。与「孤儿键保留」同一哲学：变更元数据不静默销毁数据。

**17 · 列表与流转入口 — 列选择器 + 多选动作条**
固定列之外可勾选任意自定义字段，选择存 localStorage，无后端改动。列表勾选后升起动作条，一次提交生成 `batch_id`。发货场景一步到位。

**18 · CSV 导入 — 仅新增 · 双行表头**
遇到已存在的 MAC 当作错误行报出，语义最安全。模板首行中文 label、次行机器 key，改 label 不会弄坏存量模板。
*代价*：批量改属性没有路径，只能逐台手改。

**19 · 搜索 — 精确优先 · 否则子串**
先试 SN / 别名 SN / 规范化 MAC 精确命中，命中即直接跳详情页（扫码场景一步到位）；未命中再对型号名与备注走子串匹配。
*代价*：子串分支走不了索引，几千台无感，几十万台会慢。

**20 · 工程栈 — goose · TanStack Query · 双层测试**
迁移 SQL 文件 embed 进二进制，启动时自动执行；前端数据层交给 TanStack Query（乐观锁 409 重试、流转后失效刷新都是现成能力）；测试覆盖核心管线单测 + 全量 handler 集成测试。

**21 · SQLite 驱动 — modernc.org/sqlite（纯 Go，无 CGO）**
构建以 `CGO_ENABLED=0` 进行，单二进制因此可直接交叉编译，不需要目标平台的 C 工具链。
*代价*：modernc 是 C 到 Go 的转译移植，读写吞吐低于 `mattn/go-sqlite3`。在万级资产、十人并发的量级下不构成瓶颈，但一旦量级变化，这是第一个要重新评估的选择。

---

## 2. 数据库 Schema

SQLite。所有主键为 UUID 文本，时间戳统一存 RFC3339 UTC 文本，前端按浏览器时区显示。`archived_at` 表示停用（可恢复），`deleted_at` 为软删除预留列 —— demo 阶段走硬删，切换时只改 handler 不动表。

### users

OIDC 与本地账号统一表。只停用不删除，停用前强制转移名下资产。

```sql
CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  auth_type      TEXT NOT NULL,               -- oidc | local
  password_hash  TEXT,                        -- local 专用
  oidc_subject   TEXT UNIQUE,                 -- oidc 专用
  status         TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  role           TEXT NOT NULL DEFAULT 'admin',   -- 预留，代码不校验
  token_version  INTEGER NOT NULL DEFAULT 0,  -- 预留，即时吊销用
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
```

### holder_entities

用户之外的一切持有方。恰好一个 location 可标为默认库存点，「归还」一键回到它。

```sql
CREATE TABLE holder_entities (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,             -- company | location | department | …
  name             TEXT NOT NULL,
  parent_id        TEXT REFERENCES holder_entities(id),
  is_default_stock INTEGER NOT NULL DEFAULT 0,
  attrs            TEXT NOT NULL DEFAULT '{}',  -- 类型专属字段
  archived_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE(type, name, parent_id)
);

-- 全局至多一个默认库存点
CREATE UNIQUE INDEX ux_default_stock
  ON holder_entities(is_default_stock) WHERE is_default_stock = 1;
```

### categories

树形。`path` 为物化路径，子树查询走 `LIKE` 而非递归 CTE。`sn_template` 未设则沿父链向上取第一个非空值。

```sql
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,           -- 模板中 {{ .category.code }}
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES categories(id),
  path        TEXT NOT NULL,                  -- '/root/child/self/'
  sn_template TEXT,                           -- 空则继承父级
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX ix_categories_path ON categories(path);
```

### field_definitions · category_fields

字段是全局实体，类别只绑定并决定是否必填。同名即同义、同类型、同唯一性 —— 由结构保证而非运行时校验。

```sql
CREATE TABLE field_definitions (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,           -- attrs 里的键名
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,                  -- text|number|boolean|date|enum
                                              -- |reference|mac|ip|url|computed
  options     TEXT NOT NULL DEFAULT '{}',     -- 见「字段类型契约」
  is_unique   INTEGER NOT NULL DEFAULT 0,     -- 全局唯一（按 key）
  archived_at TEXT,                           -- 只能停用，孤儿键保留
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE category_fields (
  category_id TEXT NOT NULL REFERENCES categories(id),
  field_id    TEXT NOT NULL REFERENCES field_definitions(id),
  required    INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, field_id)
);
```

### product_models

拷贝语义：`attr_defaults` 只在录入时预填，实际值仍写进资产自身，`assets` 行保持自包含。

```sql
CREATE TABLE product_models (
  id            TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  name          TEXT NOT NULL,
  vendor        TEXT,
  image_url     TEXT,
  attr_defaults TEXT NOT NULL DEFAULT '{}',
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(category_id, name)
);
```

### assets · asset_sn_history

核心表。`status/holder/owner` 是流转事件的物化快照，与事件同事务写入。

```sql
CREATE TABLE assets (
  id          TEXT PRIMARY KEY,
  sn          TEXT NOT NULL UNIQUE,           -- computed，MAC 变更时重算
  category_id TEXT NOT NULL REFERENCES categories(id),
  model_id    TEXT REFERENCES product_models(id),
  status      TEXT NOT NULL,                  -- in_stock|in_use|in_repair|lost|retired
  owner_id    TEXT NOT NULL REFERENCES users(id),
  holder_type TEXT NOT NULL,                  -- user | entity
  holder_id   TEXT NOT NULL,
  attrs       TEXT NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,     -- 乐观锁
  deleted_at  TEXT,                           -- 预留，demo 走硬删
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX ix_assets_cat_status ON assets(category_id, status);
CREATE INDEX ix_assets_owner      ON assets(owner_id);
CREATE INDEX ix_assets_holder     ON assets(holder_type, holder_id);
CREATE INDEX ix_assets_mac        ON assets(json_extract(attrs, '$.mac'));

-- MAC 修正后旧 SN 仍可搜索命中，并提示已变更
CREATE TABLE asset_sn_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sn          TEXT NOT NULL,
  replaced_at TEXT NOT NULL
);
CREATE INDEX ix_sn_history ON asset_sn_history(sn);
```

### asset_transfers

全量前后值，单条自包含，历史页无需 join 前一条。仅链尾事件可编辑，且必须留痕。

```sql
CREATE TABLE asset_transfers (
  id               TEXT PRIMARY KEY,
  asset_id         TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  batch_id         TEXT,                      -- 同批流转共享，历史页可折叠
  kind             TEXT NOT NULL,             -- create|checkout|checkin
                                              -- |transfer|reassign|status_change

  from_status      TEXT,                      -- kind='create' 时全为 NULL
  from_holder_type TEXT,
  from_holder_id   TEXT,
  from_owner_id    TEXT,

  to_status        TEXT NOT NULL,
  to_holder_type   TEXT NOT NULL,
  to_holder_id     TEXT NOT NULL,
  to_owner_id      TEXT NOT NULL,

  note             TEXT,
  due_at           TEXT,                      -- 预期归还，demo 不做逾期提醒
  actor_id         TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,

  edited_at        TEXT,                      -- 编辑留痕，三列缺一不可
  edited_by        TEXT,
  original         TEXT                       -- 编辑前 JSON 快照
);

CREATE INDEX ix_transfers_asset ON asset_transfers(asset_id, created_at DESC);
CREATE INDEX ix_transfers_batch ON asset_transfers(batch_id);
```

### audit_log

元数据变更留痕。改一条 SN 生成规则会重算全库编号 —— 必须查得到是谁、什么时候改的。

```sql
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,   -- create | update | archive | delete | recompute
  target_type TEXT NOT NULL,   -- category | field | model | holder | user
  target_id   TEXT NOT NULL,
  before      TEXT,
  after       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX ix_audit_target ON audit_log(target_type, target_id, created_at DESC);
```

---

## 3. 字段类型契约

十种类型。`field_definitions.options` 是每种类型的配置载体，形状由 type 决定 —— 后端按 type 反序列化到对应 struct，前端按 type 选渲染组件。这份契约同时是动态表单、筛选器与 CSV 模板的唯一数据源。

### options 的形状

```jsonc
// text — 可选自定义正则
{ "regex": "^[A-Z]{2}-\\d{4}$", "regex_hint": "两位大写字母 + 四位数字" }

// number
{ "min": 0, "max": 65535, "precision": 0, "unit": "W" }

// date / boolean — 无需配置
{}

// enum — deprecated 中的值仍显示、仍可筛选，但下拉里置灰不可新选
{ "choices": [ { "value": "v213", "label": "2.1.3" },
               { "value": "v220", "label": "2.2.0" } ],
  "deprecated": [ "v190" ] }

// reference — 指向用户，或指向限定 type 的 holder_entities
{ "target": "user" }
{ "target": "entity", "entity_types": [ "location" ] }

// mac / ip / url — 内置规范化与校验，无需配置
{}

// computed
{ "template": "{{ .attrs.mac | hex2dec }}" }
```

### 模板上下文

可引用 `.id`、`.attrs.<key>`、`.category.code`、`.category.name`、`.model.name`、`.model.vendor`。

**不含** `created_at`、`owner`、`status` —— 时间与流转状态会变，放进标识符生成规则里等于埋雷。

### 函数白名单

| 函数 | 说明 |
|---|---|
| `hex2dec` / `dec2hex` | 进制转换。`{{ .attrs.mac \| hex2dec }}` 是 SN 的默认规则 |
| `pad s n` | 左侧补零到 n 位 |
| `trunc s n` | 截断到前 n 个字符 |
| `slice s a b` | 取子串 [a, b) |
| `upper` / `lower` / `trim` | 大小写与空白处理 |
| `replace s old new` | 全量替换 |
| `default s fallback` | 空值兜底 |
| `printf` | 格式化拼接，`{{ printf "%s-%s" .category.code (.attrs.mac \| hex2dec) }}` |

`text/template` 原生的 `if` 与 `range` **在解析阶段直接拒绝**。标识符生成规则里出现分支逻辑，是复杂度失控的第一个信号。

---

## 4. 资产保存管线

保存一台资产要跑完这条链，全程在单个 `BEGIN IMMEDIATE` 事务内。顺序不可调换 —— 每一步都依赖前一步的输出。创建、编辑、改类别、CSV 导入的每一行，走的都是这同一条管线。

1. **解析有效字段集** — 沿 `categories.path` 向上取全部祖先，把它们绑定的字段取并集。只追加不覆盖，所以并集就是最终定义，无需合并规则。
2. **合并型号默认值** — 若指定了 `model_id`，用 `attr_defaults` 预填未提交的键。拷贝语义 —— 填完就与型号脱钩。
3. **规范化格式型字段** — `mac` 统一为大写无分隔符（`001A2B3C4D5E`），`ip`、`url` 同理。**必须早于唯一性校验**，否则同一张网卡的三种写法会被当成三台设备。
4. **校验类型、必填与正则** — 按字段类型与 `options` 逐项校验；`reference` 检查目标存在且未停用。错误定位到具体字段，装进响应的 `error.fields`。
5. **按拓扑序求 computed** — 字段定义保存时已建好 DAG 并检测过环，此处直接按拓扑序求值。任意一项失败即回滚整个保存。
6. **按 sn_template 求 SN** — 沿类别父链取第一个非空 `sn_template`，用同一套引擎求值，结果写进固定列而非 `attrs`。
7. **事务内校验唯一字段** — 对所有 `is_unique` 字段与 `sn` 做 `SELECT … WHERE json_extract(attrs,'$.key') = ? AND id != ?`。写事务已持有排他锁，此处不存在竞态。
8. **SN 变更则归档旧值** — 新算出的 SN 与旧值不同时，把旧 SN 写入 `asset_sn_history`，使已打印的标签仍可搜索命中，并在结果里提示「此编号已变更」。
9. **带乐观锁写入** — `UPDATE assets … WHERE id = ? AND version = ?`，不命中返回 409「他人已修改，请刷新」。
10. **状态三元组变化则记事件** — `status / holder / owner` 任一变化即写一条 `asset_transfers`，含全量前后值。仅属性变更不产生流转记录。

---

## 5. 元数据变更规则

自定义字段系统真正会烂掉的地方不是结构，是结构在时间里的演化。下表是全部破坏性操作的判定规则 —— 一条统一心智：**有引用则拒绝，无引用则保留数据**。

| 操作 | 判定 | 规则 |
|---|---|---|
| 停用字段 | 拒绝 | 被任何 computed 模板引用时拒绝，错误里列出引用它的字段。堵死「停用 `mac` 导致全库永久无法保存」的自锁路径。 |
| 停用 / 删除 holder_entity | 拒绝 | 被任何资产持有、或被任何 reference 字段指向时拒绝，列出前几台引用它的资产。 |
| 停用用户 | 拒绝 | 名下仍有资产时拒绝，必须先转移负责人。 |
| 删除 enum 选项 | 允许 | 存量旧值原样保留、仍可筛选，下拉里置灰不可新选，下次编辑该资产时提示更换。 |
| 解绑字段 / 资产改类别 | 允许 | `attrs` 中的孤儿键原样保留，在详情页折叠区显示为「已归档字段」，不参与校验与搜索。改回去即恢复。 |
| 修改 sn_template | 允许 | 只影响后续求值，存量编号不动。库里因此会短暂存在两套编号 —— 由下面的重算动作收敛。 |
| 重算存量 SN | 两阶段 | 先干跑，返回「影响 1,847 台，发现 2 处冲突」及冲突对明细；确认后单事务执行，旧编号批量归档进 `asset_sn_history`。**任一唯一性冲突即整体回滚**，绝不留半新半旧的库。 |
| 移动类别节点 | 拒绝 | 该节点或其子树下存在资产时，禁止变更 `parent_id`。逃生舱：建新类别 → 批量改资产类别 → 旧类别清空后即可移动或停用。 |
| 删除资产 | 允许 | 硬删并级联流转历史与 SN 别名，需输入该资产 SN 二次确认。`deleted_at` 列已预留，切软删只改 handler。 |

---

## 6. 前端信息架构

单页应用，同源部署无 CORS。数据层统一走 TanStack Query —— 流转提交后按 query key 失效资产列表、详情与时间线，乐观锁 409 直接映射为「他人已修改」提示并重取。

### 路由

| 路由 | 内容 |
|---|---|
| `/login` | 本地账号表单 + 「使用 Google 登录」 |
| `/assets` | 默认页。搜索框、筛选器、列选择器、多选动作条 |
| `/assets/new` | 先选类别 → 拉该类别 schema → 渲染动态表单；选型号后预填默认值 |
| `/assets/:id` | 属性区（含已归档字段折叠块）+ 流转时间线 + 操作按钮组 |
| `/categories` | 类别树、字段绑定与必填开关、`sn_template` 编辑与「重算存量」入口 |
| `/fields` | 全局字段库。类型、options、唯一性、停用（含反向依赖提示） |
| `/models` | 型号与 `attr_defaults` |
| `/holders` | 公司 / 位置 / 部门树，默认库存点标记 |
| `/users` | 用户列表、建本地账号、停用 |
| `/import` | 模板下载 → 上传 → 预览逐行校验 → 提交 |
| `/audit` | 元数据变更流水，按目标类型与时间筛选 |

### 列表页

固定列：SN、型号、类别、状态、持有方、负责人。列选择器的候选项来自当前筛选类别的 schema，勾选结果存 `localStorage`，不落服务端。

搜索框先试精确命中 —— 命中唯一一台即直接跳转详情页，扫码枪一步到位；未命中再落回子串搜索的结果列表。

类别筛选带「含子类别」开关，默认开启，走 `categories.path` 前缀匹配。自定义字段筛选器同样由 schema 生成：`enum` 渲染多选、`boolean` 渲染三态、其余渲染等值输入框，一律映射为 `attr.<key>=` 查询参数。

### 多选动作条

勾选任意行后底部升起动作条：**签出**、**归还**、**转移**、**改负责人**、**改状态**、**改类别**。弹层里选目标 + 写备注，一次提交生成共享 `batch_id`，单事务写入。

「归还」默认指向标记为默认库存点的位置，可改。「改类别」先预览目标类别缺哪些必填字段，补齐后才能提交。

---

## 7. CSV 导入

仅新增，不做 upsert。模板按类别生成，列即该类别的有效字段集。双行表头：首行中文 label 给人看，次行 key 给机器认 —— 导入时只认 key 行，改 label 不会弄坏任何存量模板。

```
# GET /api/categories/:id/import-template.csv

资产型号,基准 MAC,固件版本,安装位置,备注
model,mac,firmware,install_location,note
SDWAN-X100,00:1A:2B:3C:4D:5E,2.1.3,上海办公室-3F-机房A,
SDWAN-X100,00:1A:2B:3C:4D:5F,2.1.3,上海办公室-3F-机房A,备用机
```

### 解析与校验

`model` 与 `reference` 类型的列**按名称匹配**已有记录，找不到即报错 —— 导入永不隐式创建型号或位置。`computed` 字段不出现在模板里，由管线求值产生。

每一行都完整跑一遍[保存管线](#4-资产保存管线)，因此正则、唯一性、SN 求值的行为与手工录入完全一致。

预览接口返回逐行结果，不落库：

```json
{
  "total": 120,
  "ok": 117,
  "rows": [
    { "line": 7,  "status": "error",
      "fields": { "mac": "MAC 格式非法：00:1A:2B:3C:4D" } },
    { "line": 12, "status": "error",
      "fields": { "mac": "已存在：资产 112394521950" } },
    { "line": 34, "status": "error",
      "fields": { "install_location": "找不到位置「上海办公室-4F」" } }
  ]
}
```

提交阶段单事务写入，**任一行失败即全部回滚**。每行额外写一条 `kind=create` 的流转事件，共享同一个 `batch_id`，因此「那次导入进来了哪些设备」是可追溯的。

---

## 8. API 表面

流转是动作而非资源修改，因此走独立端点而不是 `PATCH /assets/:id`。`/categories/:id/schema` 是前端动态表单、筛选器与 CSV 模板的唯一数据源 —— 加字段永不需要改前端代码。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 本地账号登录，签发 8h JWT |
| GET | `/api/auth/oidc/start` | 跳转 Google，回调时按域名白名单准入，域内首次登录自动建号 |
| GET | `/api/me` | 当前用户 |
| GET | `/api/categories/:id/schema` | 有效字段集（祖先并集、必填、排序、options）+ 生效的 `sn_template` |
| GET | `/api/assets` | 搜索 + 筛选 + 分页。`q`（精确优先，否则子串）、`category_id` + `include_descendants`、`status`、`owner_id`、`holder`，以及任意 `attr.<key>=` |
| POST | `/api/assets` | 创建，跑完整保存管线并写 `kind=create` 事件 |
| PATCH | `/api/assets/:id` | 改属性或改类别，请求带 `version`，冲突返回 409 |
| DELETE | `/api/assets/:id` | 硬删并级联流转历史，需二次确认输入 SN |
| GET | `/api/assets/:id/transfers` | 完整流转历史，同 `batch_id` 可折叠 |
| POST | `/api/transfers` | 流转。`asset_ids[]` 多于一个时生成共享 `batch_id`，单事务写入 |
| PATCH | `/api/transfers/:id` | 仅当它是该资产的链尾事件时可改；批量事件只能整批改；写入 `edited_*` 留痕 |
| POST | `/api/categories/:id/recompute-sn` | `?dry_run=true` 返回影响台数与冲突清单；否则单事务执行，冲突即整体回滚 |
| GET | `/api/categories/:id/import-template.csv` | 双行表头模板 |
| POST | `/api/import/preview` | 上传 CSV，逐行校验并返回错误清单，不落库 |
| POST | `/api/import/commit` | 确认后单事务写入，任一行失败即全部回滚 |
| GET | `/api/export.csv` | 按当前筛选条件导出 |
| CRUD | `/api/{categories,fields,models,holders,users}` | 元数据管理，全部写 `audit_log`，全部受[变更规则](#5-元数据变更规则)约束 |

### 约定

错误统一 envelope，`fields` 让动态表单能把错误定位到具体输入框：

```json
{ "error": {
    "code": "validation_failed",
    "message": "资产保存失败",
    "fields": { "mac": "MAC 格式非法",
                "firmware": "此字段必填" } } }
```

分页 `offset` / `limit` + `total`。几千台资产不需要 keyset 分页，而列表页需要「共 1,847 条」。

---

## 9. 工程约定

单二进制交付：React 构建产物经 `embed.FS` 打进 Go 二进制，gin 同时服务 `/api` 与静态文件。部署 = 一个可执行文件 + 一个 `.db`。开发时 Vite proxy 到 gin。

### SQLite 配置

驱动使用 `modernc.org/sqlite` —— 纯 Go 实现，不走 CGO。构建以 `CGO_ENABLED=0` 进行，单二进制因此可直接交叉编译，不需要目标平台的 C 工具链。**禁止换用需要 CGO 的驱动**，那会让交付形态退化。

连接 DSN 必须显式声明 pragma，并在开库后**回读断言**。实测 modernc v1.57.0 两种参数语法都接受，但漏写或拼错任一参数都会静默降级为默认值（`journal_mode=delete`、`busy_timeout=0`），开库不报任何错：

```
file:nexus.db?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)
```

`assets` 的写事务**一律 `BEGIN IMMEDIATE`**，Go 侧写连接池设为 1。

这不是性能优化，是**唯一性校验成立的前提** —— 默认的 `BEGIN DEFERRED` 下两个事务可以同时读到「无冲突」再各自尝试写入。读连接池可以放开。

### 目录结构

```
cmd/nexus/main.go
internal/
  auth/       // OIDC、JWT 签发与校验、域名白名单中间件
  store/      // SQLite 连接、pragma、事务助手、goose 迁移驱动
  schema/     // 类别继承解析、字段定义、options 契约
  compute/    // text/template FuncMap、DAG 拓扑排序与环检测
  asset/      // 保存管线、唯一性校验、SN 求值与重算
  transfer/   // 单条与批量流转、链尾编辑
  importer/   // CSV 模板、预览、提交
  audit/
  httpapi/    // gin handlers、错误 envelope、分页
migrations/   // 001_init.sql … 由 goose 执行，embed 进二进制
web/          // React 源码
  dist/       // 构建产物，embed.FS 挂载点
```

### verify 对帐

`nexus verify` 按 `asset_id` 分组、按 `created_at` 排序，做两件事：

1. 比对末条事件的 `to_*` 与 `assets` 上的物化快照；
2. 校验相邻事件的 `from_*` 是否等于前一条的 `to_*`。

**第二项能抓出直接写库、绕过保存管线的代码路径** —— 这正是物化快照漂移的唯一来源。纳入 CI，用一份含流转历史的种子库跑。

### 测试

单元测试覆盖六块真正难写对的逻辑：继承字段集解析、MAC 规范化、computed 拓扑求值与环检测、唯一性校验、SN 重算与冲突回滚、verify 对帐。

之上是全量 handler 集成测试，每个端点跑真 SQLite 临时库。

---

## 10. 已知风险

这些不是待办事项，是已经接受了代价的决策。列在这里，是为了将来出问题时能立刻认出原因。

**阻塞录入 · 没有 MAC 就无法入库**
「MAC 必填」+「computed 求值失败阻止保存」组合的直接后果：扫码入库、CSV 导入时，任何一行缺 MAC 都是硬失败，连草稿都存不下。若实际工作流需要「先录一条，MAC 后补」，就必须放宽为「必填字段阻止、选填字段存空」。

**无批量改属性 · 导入仅新增，属性只能逐台改**
批量流转能改 `status / holder / owner`，但改不了 `attrs`。「给这 40 台设备统一标记固件已升级到 2.2.0」在本版没有路径。补法是在多选动作条上加一个「批量改字段值」动作，复用现成弹层，成本很小。

**类别树刚性 · 有资产的类别节点不可移动**
第一版几乎必然会把类别树建错。纠错路径是「建新类别 → 批量迁资产 → 旧类别清空后移动」，比直接拖拽节点重得多。如果 demo 期间类别树反复调整，这条会先痛起来。

**搜索线性 · 子串匹配全表扫描**
精确命中走索引，子串分支是 `LIKE '%x%'`，无索引可用。几千台无感，几十万台会明显变慢。届时的解法是 FTS5 虚拟表，已列入本版不做。

**吊销窗口 · 停用用户后 JWT 仍有效最多 8 小时**
JWT 无状态的固有代价。`users.token_version` 列已预留：校验时多比对一次即可即时吊销，代价是每次请求多一行查询。签名密钥从配置读，缺失时拒绝启动而非自动生成 —— 否则每次重启所有人掉线。

**数据漂移 · 物化快照可能与事件流不一致**
`assets` 上的状态三元组是 `asset_transfers` 的冗余副本。任何绕过保存管线直接写 `assets` 的代码路径都会造成静默漂移。`verify` 的链完整性校验就是为抓这个而写的，必须进 CI。

**可变历史 · 链尾流转事件可被编辑**
与「不可变事件表」有张力。三条约束把它锁住：编辑窗口截止于该资产产生下一条事件；`edited_at / edited_by / original` 三列必须写；批量事件只能整批编辑。缺任何一条，事件表的审计价值就归零。

**迁移陷阱 · 唯一性依赖 SQLite 的写串行**
应用层「先 SELECT 再 INSERT」之所以可靠，前提是 `BEGIN IMMEDIATE` + 全局单写者。迁移到 Postgres 或引入多写实例时前提立刻失效，必须改为数据库级唯一索引 —— 而由于唯一字段是运行时可配的，那意味着动态 DDL。

**无权限区分 · 任何登录用户可修改任何数据**
demo 的明确取舍，靠域名白名单把风险限制在公司内部。`users.role` 已预留，第二版加权限时只需在中间件增加校验，不必改动 schema。

---

## 11. Demo 范围

明确划线，避免第一版无限膨胀。右列不是「不做」，是「这一版不做」，且每项都已确认不需要改 schema 就能补上。

| 本版交付 | 本版不做 |
|---|---|
| 类别树 + 全局字段库 + 类别绑定管理 | 权限与角色区分（`role` 列已预留） |
| 10 种字段类型，含 computed 与自定义正则 | 批量修改自定义字段值 |
| 模板函数白名单与 DAG 环检测 | CSV upsert 更新存量 |
| 型号管理与默认值预填 | 资产间引用（上联设备、所属机柜） |
| 资产 CRUD，schema 驱动的动态表单 | 流水号 / 自增序列生成器 |
| SN 自动生成、重算预览与别名归档 | 批量库存类资产（耗材按数量管理） |
| 全套元数据变更规则与反向依赖检查 | 字段级多值与附件类型 |
| 单台与批量流转，完整历史时间线 | FTS5 全文搜索 |
| 固定列 + 列选择器 + 自定义字段筛选 | 逾期提醒与定时任务（`due_at` 列已预留） |
| CSV 导出与带预览校验的导入 | 标签打印与二维码 |
| Google OIDC + 本地账号，域名白名单 | 软删除（`deleted_at` 列已预留） |
| 元数据 audit_log | 子类别覆盖父类字段定义 |
| `verify` 对帐命令，纳入 CI | 唯一性作用域细分（当前仅全局） |
