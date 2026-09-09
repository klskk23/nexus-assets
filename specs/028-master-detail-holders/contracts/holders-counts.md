# 合约变更：028

两处。写进 `internal/httpapi/docs/openapi.yaml`，并同步到
`specs/001-asset-ledger-demo/contracts/openapi.yaml`（`TestEmbeddedContractMatchesTheSpec` 守着）。

---

## 一、`GET /api/holders/counts`（新增）

一次问出全部持有方的设备数。替掉现在每个持有方一次 `/holders/{id}/usage` 的 N+1。

**权限**：读默认全开放，与 `/categories/counts` 一致。

**响应 200**：

```json
{
  "h-group": 42,
  "h-rnd": 18,
  "h-lab": 6,
  "h-seed": 12,
  "h-sh": 9
}
```

`Record<holderID, int>`，与 `/categories/counts` 同形。

**口径（写死在合约里，因为它与类别故意不同）**：

- **含子树**：键上的数字包含该持有方及其全部下级持有的设备。
- **不按状态过滤** —— 报废的设备计入。类别的那条端点排除
  `counts_as_available = 0` 的状态，**这一条不排除**；两条端点回答的是两个问题。
- **只数 `holder_type = 'entity'` 的设备**。账号持有的不在这棵树上。
- **每个持有方都有键**，没有设备的写 `0`，不缺席。

**必须与之相等**：
`GET /api/assets?holder_id=<id>&holder_include_descendants=true` 的 `total`。
服务端有一条测试对夹具里的每一个持有方比对这两者。

---

## 二、`GET /api/assets` 新增查询参数 `holder_include_descendants`

**类型**：布尔（`"true"` 生效，其余一律为假）

**默认**：**`false`**

> 与类别的 `include_descendants`（默认 `true`）**故意不同**。
> `holder_id` 在既有的资产筛选栏与既有链接里一直表示「就是这一个持有方」，
> 把默认值改成含下级会静默改变每一条已经存在的链接的含义。
> 新行为只在显式带上这个参数时发生。

**为真时**：`holder_id` 匹配该持有方**及其全部下级**（沿 `parent_id` 递归）。
仍然只匹配 `holder_type = 'entity'`。

**为假或缺省时**：行为与今天完全一致。

同一个参数也要加到读同一套筛选的其他端点上（导出、行数据、打印），
或者明确让它们保持默认为假 —— 见 tasks。

---

## 不变的东西

- `GET /api/holders`（数组形态与信封形态）请求与响应不变。
- `GET /api/holders/{id}/usage` 不变 —— 只是前端改成按需调用。
- `POST /api/holders`、`PATCH /api/holders/{id}`、`DELETE /api/holders/{id}` 不变。
- `is_default_stock` 仍只接受 `true`。
