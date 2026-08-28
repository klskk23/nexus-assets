# Phase 1 数据模型

**Feature**: 001-asset-ledger-demo | **Date**: 2026-08-28

DDL 取自 `docs/design-baseline.md` 第 2 节，是 `migrations/001_init.sql` 的权威来源。
本文在此之上补齐设计基线**未定义**的三处规则 —— 状态机的合法转换、状态与持有方的耦合、
流转事件类型的推导 —— 这三处不定义，实现时必然要临场发明。

---

## 1. 实体总览

| 实体 | 表 | 职责 |
|------|-----|------|
| 账号 | `users` | 系统使用者。可作负责人与持有方。只停用不删除 |
| 持有方实体 | `holder_entities` | 账号之外的持有方：公司 / 位置 / 部门。树形 |
| 类别 | `categories` | 树形分类。决定信息项集合与编号生成规则 |
| 信息项定义 | `field_definitions` | 全局的信息项说明。key 全局唯一 |
| 类别绑定 | `category_fields` | 类别 ← 信息项，决定是否必填与排序 |
| 型号 | `product_models` | 同款产品的共性信息与默认值 |
| 资产 | `assets` | 一台物理设备的台账记录 |
| 编号历史 | `asset_sn_history` | SN 变更后的旧编号别名 |
| 流转记录 | `asset_transfers` | 不可变的持有方/负责人/状态变化凭证 |
| 审计条目 | `audit_log` | 配置类对象的变更留痕 |

---

## 2. DDL

见 `docs/design-baseline.md` 第 2 节的完整建表语句，逐字落入 `migrations/001_init.sql`，
包裹 goose 的 `-- +goose Up` / `-- +goose Down` 注释。此处只重述**易被漏掉的两条索引**：

```sql
-- 表达式索引：MAC 唯一性校验与搜索都要走它
CREATE INDEX ix_assets_mac ON assets(json_extract(attrs, '$.mac'));

-- 部分唯一索引：保证全局至多一个默认库存点
CREATE UNIQUE INDEX ux_default_stock
  ON holder_entities(is_default_stock) WHERE is_default_stock = 1;
```

两者都是 ORM 无法从 struct 推导的形态，必须手写在迁移里（research.md D4）。

---

## 3. 状态机 *(设计基线未定义，本计划补齐)*

五种状态：`in_stock` 在库 / `in_use` 已签出 / `in_repair` 维修中 / `lost` 丢失 / `retired` 报废。

### 合法转换

| 从 \ 到 | in_stock | in_use | in_repair | lost | retired |
|---------|:--------:|:------:|:---------:|:----:|:-------:|
| **in_stock** | ○ | ✅ | ✅ | ✅ | ✅ |
| **in_use** | ✅ | ○ | ✅ | ✅ | ✅ |
| **in_repair** | ✅ | ✅ | ○ | ✅ | ✅ |
| **lost** | ✅ | ❌ | ❌ | ○ | ✅ |
| **retired** | ❌ | ❌ | ❌ | ❌ | ○ |

说明：

- **对角线（○）恒允许**：状态没变就不存在转换，无需校验。这一点在实现中被验证过 ——
  若把同状态也当成一次转换去校验，给一台报废设备改个备注都会被拒
- 状态不变而持有方变（张三转给李四）合法，事件类型为 `transfer`
- **`lost` 只能转回 `in_stock` 或转向 `retired`**：设备找回后必须先入库确认，
  不能从丢失直接签出给人
- **`retired` 是终态**：任何转出都被拒绝。误报废的修正路径是
  **在该资产产生下一条流转记录之前编辑那条链尾事件**（FR-042）。这是刻意的 ——
  已经走完报废流程的设备通常已被物理处置，允许随意"复活"会让报废这个状态失去意义

### 状态与持有方的耦合 *(设计基线未定义，本计划补齐)*

| 状态 | 持有方约束 |
|------|-----------|
| `in_stock` | **必须**是 `type = 'location'` 的持有方实体 |
| `in_use` | 可以是账号，也可以是任意类型的持有方实体 |
| `in_repair` | 可以是账号（送修人）或实体（维修点） |
| `lost` | 保留丢失前的持有方，不做约束 |
| `retired` | 保留报废前的持有方，不做约束 |

`in_stock` 的约束来自 FR-045：归还操作指向一个位置。若允许「在库但持有方是某个人」，
盘点时就无法回答"这台在哪个库房"。这条约束在保存管线的校验阶段强制。

---

## 4. 流转事件类型的推导 *(设计基线未定义，本计划补齐)*

一次保存最多产生一条流转记录。`kind` 按下列顺序**取第一个命中的**：

1. 资产是新建的 → `create`（`from_*` 全为 NULL）
2. `status`: `in_stock → in_use` → `checkout`
3. `status`: `in_use → in_stock` → `checkin`
4. `status` 发生了其他变化 → `status_change`
5. `status` 未变但 `holder` 变了 → `transfer`
6. `status` 与 `holder` 均未变但 `owner` 变了 → `reassign`
7. 三者都没变 → **不产生流转记录**（纯属性修改）

顺序不可调换：签出同时会改变 status 与 holder，若先判 holder 就会被记成 `transfer`，
时间线上读不出"签出"这件事。

---

## 5. 校验规则

### 资产（保存管线的校验阶段）

| 规则 | 来源 |
|------|------|
| `category_id` 必须存在且未停用 | FR-022 |
| 有效信息项集 = 沿 `categories.path` 向上全部祖先绑定的并集 | FR-020 |
| 绑定时若与祖先链上已有的 key 冲突 → 拒绝绑定 | FR-021 |
| 所有 `required` 信息项必须有值 | FR-029 |
| `mac` / `ip` / `url` 类型先规范化再校验 | FR-010 |
| `text` 类型若配了 `regex` 则必须匹配 | FR-026 |
| `enum` 值必须在 `choices` 内；`deprecated` 中的值只允许保持不变，不允许新设 | FR-034 |
| `reference` 目标必须存在且未停用；`entity_types` 限定时类型必须匹配 | FR-032 |
| `is_unique` 的信息项在全表范围内唯一（排除自身） | FR-011 |
| `owner_id` 必须存在且账号未停用 | FR-014 |
| `holder` 必须存在且未停用；`in_stock` 时必须为 location 类型 | FR-015、§3 |
| `status` 转换必须在 §3 的合法转换表内 | 本计划补齐 |
| `sn` 全表唯一 | FR-008 |
| 提交的 `version` 必须与库中一致，否则 409 | FR-018 |

### MAC 规范化

统一为**大写、无分隔符、12 位十六进制**：`00:1a:2b-3C:4D:5e` → `001A2B3C4D5E`。
规范化**必须早于唯一性校验**，否则同一张网卡的不同写法会被当成不同设备（FR-010）。
非法长度或含非十六进制字符时报格式错误。

### 计算项

- 依赖集合由语法树抽取（research.md D6），不用正则
- 建 DAG，保存字段定义时检测环；有环则拒绝并输出环路径（FR-028）
- 求值按拓扑序；任一项失败即整个保存回滚，错误定位到该信息项（FR-029）
- 被任何计算项或 `sn_template` 引用的信息项不得停用（FR-031）

### SN

- 生成规则取自 `categories.sn_template`，未设则沿父链向上取第一个非空值（FR-008）
- 求值上下文：`.id`、`.attrs.<key>`、`.category.code`、`.category.name`、
  `.model.name`、`.model.vendor`。**不含**时间与流转状态
- 新旧 SN 不同时，旧值写入 `asset_sn_history`（FR-012）
- 重算存量为两阶段：干跑返回受影响台数与冲突对；执行阶段任一冲突即整体回滚（FR-035、FR-036）

### 引用完整性（统一规则：有引用则拒绝）

| 操作 | 拦截条件 |
|------|---------|
| 停用信息项 | 被任何计算项或 `sn_template` 引用 |
| 停用/删除持有方实体 | 被任何资产持有，或被任何 `reference` 信息项指向 |
| 停用账号 | 名下仍有资产（作为 `owner_id`），或仍作为某资产的 holder |
| 移动类别节点 | 该节点或其子树下存在资产 |

错误响应中必须列出前若干个阻挡对象，让用户不必自行排查（SC-012）。

---

## 6. 有效字段集解析

```
resolveFields(categoryID):
  path   := categories[categoryID].path        # '/root/child/self/'
  ids    := 解析 path 得到的祖先链（含自身，自根向下）
  fields := []
  for id in ids:
      for binding in category_fields[id] 按 sort:
          if binding.field.key 已在 fields 中: 报错（绑定阶段本应已拦截）
          fields.append(binding)
  return fields
```

类别数量在百量级，全部载入内存并在写操作后失效即可，不必每次查库。

---

## 6.5 事件的全序 *(实现中发现，补记)*

流转事件按 `created_at` 排序，而最初的时间戳格式是秒级 RFC3339 —— **同一秒内写入的两条
事件顺序不确定**。这会同时打乱三处：详情页时间线的显示顺序、「链尾事件」的判定
（决定哪条可编辑），以及 `verify` 的链式重放。三者都不会报错，只会给出错误答案。

两条修正：

1. 时间戳统一存 `RFC3339Nano`（纳秒精度）。读取仍用 `RFC3339` 版式解析 ——
   Go 的解析器接受版式中没有的小数秒。
2. 所有按事件排序的查询一律 `ORDER BY created_at, rowid`，把 rowid 作为兜底，
   使顺序在纳秒也相同时仍然是全序。

注意 `rowid` **不能写进索引定义**（SQLite 会报 `no such column: rowid`），
它只能出现在 `ORDER BY` 里。索引保持 `(asset_id, created_at DESC)`。

---

## 7. 关键不变量

实现完成后，下列断言在任意时刻都必须成立。它们是 `nexus verify` 与集成测试的验收目标：

1. 每台未删除的资产都有非空的 `owner_id`，且该账号存在（SC-010）
2. 每台资产的 `(status, holder, owner)` 等于其流转时间线最后一条记录的 `to_*`（SC-011）
3. 相邻两条流转记录之间，后一条的 `from_*` 等于前一条的 `to_*` ——
   **这一条专门用来抓绕过保存管线直接写库的代码路径**
4. `assets.sn` 全表唯一，且不与任何 `asset_sn_history.sn` 冲突
5. `holder_entities` 中 `is_default_stock = 1` 的行至多一条
6. 所有 `status = 'in_stock'` 的资产，其 holder 都是 `type = 'location'` 的实体
