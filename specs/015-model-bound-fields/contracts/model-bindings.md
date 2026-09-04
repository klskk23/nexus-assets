# Phase 1 · 接口契约变更

本轮的接口变更**全是加法**：新增两个端点、给三处响应加字段、给一处请求加参数。
没有任何既有字段被移除或改变含义——`GET /api/categories` 的数组形状、
`sys_` 前缀约定、导出的固定九列都不受影响。

变更落地时必须同步 `specs/001-asset-ledger-demo/contracts/openapi.yaml`
与它在 `internal/httpapi/docs/openapi.yaml` 的副本（有测试盯着两者一致）。

## 新增：型号绑定的建与解

### `POST /api/models/{id}/fields`

把一个字段绑到这个型号上。

```jsonc
// 请求
{ "field_id": "…", "required": false, "sort": 10 }
```

- **201**：绑定成功，返回该型号当前的绑定列表。
- **409 `field_binding_mode_conflict`**：这个字段已经有类别绑定，
  一个字段只能是纯类别或纯型号绑定（决策 96）。
- **409 `key_conflict`**：这个字段的 key 已经被该型号覆盖范围内的另一个字段占用。
- **404**：型号或字段不存在。

权限：`schema.manage`（不新增开关，决策 96 之外沿用既有）。

### `DELETE /api/models/{id}/fields/{fieldId}`

解绑。存量取值按既有规则进 `archived_attrs`。

- **204**：解绑成功。
- **409 `field_depended_on`**：还有绑定在此处的表达式字段读它（沿用既有守卫）。
- **404**：绑定不存在。

## 加字段：类别的有效字段集

### `GET /api/categories/{id}/schema`

`fields[]` 的每一项新增一项：

```jsonc
{
  "id": "…", "key": "servicetag", "label": "ServiceTag",
  "type": "text", "required": false, "sort": 10,
  "model_ids": ["model-a", "model-b"]   // 新增：型号模式为绑定的型号；类别模式为 []
}
```

调用方据此判断：
- 录入/编辑某台资产时，`model_ids` 非空的字段只在资产的 `model_id` 命中时渲染；
- 显示列下拉里，`model_ids` 非空的字段只在型号筛选命中时可勾（决策 103）。

**这是加字段，不改形状**：既有调用方忽略它即可，行为不变。

## 加字段：字段列表

### `GET /api/fields`

`items[]` 每一项新增两项，用于字段库页面展示与筛选：

```jsonc
{
  "…": "…",
  "binding_mode": "category" | "model" | "unbound",  // 新增
  "model_ids": ["…"]                                  // 新增：型号模式时非空
}
```

`category_ids`（既有）在型号模式下为空数组。

## 加参数：资产列表按型号筛选

### `GET /api/assets`

新增查询参数 `model_id`（可选）。语义与既有的 `status`、`owner_id`、
`holder_id` 一致：给了就收窄，不给就不收窄。

同一参数同样适用于 `GET /api/assets/export`（导出跟随列表的筛选，既有约定）。

**注意**：`model_id` 只影响**行**，不影响**列**——导出的列集仍由类别的完整 schema
决定（决策 102）。

## 行为变更（无接口形状变化）

| 端点 | 变更 | 依据 |
|---|---|---|
| `GET /api/assets/export` | 列集含型号模式字段，固定出现 | 决策 102 |
| `GET /api/import/template/{categoryId}` | 模板列含型号模式字段 | 决策 102 |
| `POST /api/import/preview` | 「所选型号未绑该字段但该列有值」的行标为错误 | 决策 102 |
| `PATCH /api/assets/{id}` | 换型号导致不适用的值进 `archived_attrs` | 决策 98 |
| `PATCH /api/categories/{id}` | `display_key` 拒绝型号模式字段 | 决策 100 |
| `GET /api/rows` | 列随之变宽，不匹配行留空 | 决策 101 |

## 新增 error code

| code | 何时 | HTTP |
|---|---|---|
| `field_binding_mode_conflict` | 给已有类别绑定的字段加型号绑定（或反之） | 409 |
| `display_key_not_category_field` | 把型号模式字段设为类别的 `display_key` | 422 |
| `field_not_for_model` | 导入行的型号未绑该字段却填了值 | 逐行错误，非 HTTP 状态 |

三者的 `message` 需中英双语（`internal/i18n/catalog.go`），
`code` 本身不翻译（章程原则 V）。
