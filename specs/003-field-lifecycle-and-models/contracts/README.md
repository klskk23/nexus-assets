# API 契约：相对 001/002 的增量

**Feature**: 003-field-lifecycle-and-models | **Date**: 2026-08-30

全局约定（认证、错误 envelope、分页、乐观锁、时间、命名、筛选参数）沿用
[001 的契约约定](../../001-asset-ledger-demo/contracts/README.md)，本文不重复。

**全量端点清单仍以 [001 的 openapi.yaml](../../001-asset-ledger-demo/contracts/openapi.yaml)
为准，该文件随本特性就地更新。** 本目录下的 [openapi.yaml](./openapi.yaml) 只描述增量。

---

## 变更清单

### 路径

| 变化 | 路径 | 说明 |
|------|------|------|
| **新增** | `DELETE /api/categories/{id}/bindings/{field_id}` | 解绑。护栏自 002 就写好了，但一直没有调用者 |
| **新增** | `DELETE /api/fields/{id}` | 删除信息项，取代 `PATCH /fields/{id}` 的 `archive: true` |
| 请求去字段 | `PATCH /api/fields/{id}` 不再接受 `archive` | 停用机制从信息项上移除 |
| 请求改字段 | `POST /api/models` 的 `category_id` → `category_ids` | 多对多 |
| 响应改字段 | 型号的 `category_id` → `category_ids` | 同上 |

### 资源结构

**FieldDefinition**

```diff
- "archived_at": null        // 停用状态不复存在
```

**ProductModel**

```diff
- "category_id": "…"
+ "category_ids": ["…", "…"]    // 可为空数组：型号可以先建好再关联
  "vendor": ""                   // 仍是字符串，但服务端保证非 null
```

`vendor` 现在参与重名判定。空串是一个合法且独立的命名空间 ——
两个都没填厂商的同名型号仍然互斥。

---

## 删除信息项的拒绝形态

`DELETE /api/fields/{id}` 有三种拒绝，共用 `409 reference_blocked`，
但**携带的结构化数据不同**，前端据此渲染不同的列表：

| 拒绝原因 | 附带字段 | 内容 |
|----------|----------|------|
| 被表达式键读取 / 被选作显示编号 | `referrers` | `[{kind, id, label}]`，`kind` 为 `field` 或 `display_key` |
| 有资产填了值 | `blockers` | `[{asset_id, name}]`，前若干台；另有 `total` |

`message` 始终是一句可执行的中文，不含用于程序判定的英文标识（002 已建立的约定）。

## `blockers` 不再被丢弃

`PATCH /api/holders/{id}` 停用失败时，服务端一直在响应里附 `blockers`
（`failHolder` 的注释写的就是「让页面能显示到底什么挡着」），而前端的 `ApiError`
只解析 `referrers`，把它扔掉了。本轮起 `blockers` 与 `referrers` 一视同仁地解析并渲染。

这不是新增能力，是把一个**已经在传输的字段**接上。相关的两条中文文案
（`zhMeta.holders.blocked` / `blockedBy`）自 001 起就存在，一次也没被用过。

## 型号导入的解析

`POST /api/import/preview` 与 `/commit` 的模板形态不变：型号仍是单列名称。

名称在全库唯一命中则接受；命中多条时该行报错，提示改写为「厂商 型号」。
**不改为按 id 解析** —— 模板首行是给人读的中文，让人手填 UUID 与这个初衷直接冲突。
