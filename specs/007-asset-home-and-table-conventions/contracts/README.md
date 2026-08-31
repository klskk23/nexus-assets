# API 契约：相对 001–006 的增量

**Feature**: 007-asset-home-and-table-conventions | **Date**: 2026-08-31

全量端点清单仍以 [001 的 openapi.yaml](../../001-asset-ledger-demo/contracts/openapi.yaml)
为准，该文件随本特性就地更新。

## 变更清单

| 变化 | 路径 | 说明 |
|------|------|------|
| **新增** | `PATCH /api/models/{id}` | 改名称、厂商、类别关联、默认值 |
| **新增** | `DELETE /api/models/{id}` | 有设备使用时拒绝 |
| **新增** | `GET /api/models/{id}/usage` | `{assets}` |
| 请求加字段 | `POST/PATCH /api/assets` | `home_holder_type`、`home_holder_id`、`home_owner_id` |
| 响应加字段 | 资产 | `home_holder`、`home_owner`（已解析出名字） |
| 语义变化 | `POST /api/transfers` 的 `check_in` | 目的地改为逐台解析 |

### 资产的归属

```jsonc
// 三态，与类别、持有方的 parent_id 同一套
{ }                                  // 缺席：不动（创建时 = 录入时的持有方与负责人）
{ "home_holder_type": null }         // 显式 null：清空，回退到全局默认库存点
{ "home_holder_type": "entity",
  "home_holder_id": "…",
  "home_owner_id": "…" }             // 设置
```

响应：

```diff
+ "home_holder": { "type": "entity", "id": "…", "name": "上海仓库", "entity_type": "location" }
+ "home_owner":  { "id": "…", "name": "管理员", … }
```

### `check_in` 的解析顺序

```text
to_holder_id 给了     → 整批去那里
该资产有 home_holder  → 各自回各自的家
有全局默认库存点       → 去那里
都没有                → 422，提示选择位置
```

`to_owner_id` 同理：给了就用，否则用该资产的 `home_owner_id`，再否则不变。

**这是 007 唯一一处行为变化**：请求形状没变，变的是不指定目标时的答案。

### 型号

| 场景 | HTTP | `error.code` | 消息示例（en） |
|------|------|--------------|---------------|
| 改名撞上同厂商重名 | 409 | `unique_conflict` | `Acme already has a product called "X100".` |
| 删除时仍有设备使用 | 409 | `reference_blocked` | `1 device(s) are still assigned to "Y1". Change their model first.`（带 `total`） |
| 名称为空 | 422 | `validation_failed` | `A model needs a name.` |

`PATCH` 的每个字段都可省略，省略即不动。`category_ids` 给了就整体替换 ——
连接表除了这一对什么都不存，没有差分能保留的状态。
