# API 契约：全局约定

**Feature**: 001-asset-ledger-demo | **Date**: 2026-08-28

端点清单见 [openapi.yaml](./openapi.yaml)。本文是所有端点共用的约定，不在每个端点上重复。

## 认证

除 `/api/auth/*` 外，所有端点要求 `Authorization: Bearer <jwt>`。
JWT 有效期 8 小时，**无 refresh**，过期后返回 `401` 并要求重新登录。
签名密钥从配置读取；缺失时程序拒绝启动，不自动生成随机密钥。

## 错误 envelope

所有非 2xx 响应使用同一结构。`fields` 让动态表单能把错误定位到具体输入框，
这是章程原则 III「校验失败必须定位到具体输入项」的实现基础。

```json
{
  "error": {
    "code": "validation_failed",
    "message": "资产保存失败",
    "fields": {
      "mac": "MAC 格式非法",
      "firmware": "此字段必填"
    }
  }
}
```

- `code`：机器可读，英文 snake_case（章程原则 V）
- `message`：用户可见，中文（i18n 例外）
- `fields`：可选。key 为信息项的 `key` 或固定列名

### 错误码

| code | HTTP | 含义 |
|------|------|------|
| `unauthenticated` | 401 | 未登录或令牌过期 |
| `domain_not_allowed` | 403 | OIDC 邮箱域名不在白名单 |
| `not_found` | 404 | 目标对象不存在 |
| `validation_failed` | 422 | 字段级校验失败，见 `fields` |
| `unique_conflict` | 409 | 唯一性冲突，`fields` 指出冲突项与占用者 |
| `version_conflict` | 409 | 乐观锁冲突，他人已修改 |
| `reference_blocked` | 409 | 有引用，拒绝停用/删除，`message` 列出阻挡对象 |
| `illegal_transition` | 422 | 状态转换不在合法转换表内 |
| `not_tail_event` | 409 | 试图编辑非链尾的流转记录 |
| `template_invalid` | 422 | 模板含 `if`/`range`、引用未知函数或形成环 |
| `compute_failed` | 422 | 计算项求值失败 |
| `category_has_assets` | 409 | 类别节点或其子树下有资产，禁止移动 |
| `internal_error` | 500 | 未预期错误 |

## 分页

列表端点接受 `offset`（默认 0）与 `limit`（默认 50，**上限 200**，超出即钳制）。
响应统一包一层：

```json
{ "items": [ ], "total": 1847, "offset": 0, "limit": 50 }
```

`total` 是必需的 —— 列表页要显示「共 1,847 条」，因此不用 keyset 分页。

## 乐观锁

`PATCH /api/assets/:id` 的请求体必须带读取时拿到的 `version`。
不匹配返回 `409 version_conflict`，客户端应提示刷新而非静默重试。

## 时间

一律 RFC3339 UTC 字符串（`2026-08-28T09:15:00Z`）。前端按浏览器时区显示。

## 命名

路径、查询参数、请求/响应字段名全部英文 snake_case。
自定义信息项的取值统一放在 `attrs` 对象内，key 即 `field_definitions.key`。

## 筛选参数

`GET /api/assets` 除固定维度外，接受任意 `attr.<key>=<value>` 形式的等值筛选，
例如 `?attr.firmware=2.1.3`。未知的 key 被忽略而非报错，以免前端缓存的旧 schema
导致整页失败。

## 写操作与流转

流转是动作而非资源修改，走 `POST /api/transfers`，不通过 `PATCH /api/assets/:id`。
`asset_ids` 多于一个时服务端生成共享 `batch_id`，全部在单事务内写入。
