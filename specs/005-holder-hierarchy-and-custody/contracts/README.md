# API 契约：相对 001–004 的增量

**Feature**: 005-holder-hierarchy-and-custody | **Date**: 2026-08-31

全局约定沿用 [001 的契约约定](../../001-asset-ledger-demo/contracts/README.md)。

**全量端点清单仍以 [001 的 openapi.yaml](../../001-asset-ledger-demo/contracts/openapi.yaml)
为准，该文件随本特性就地更新。**

---

## 变更清单

### 路径

**本轮没有新增端点。** 变的是既有端点接受与返回的内容。

| 变化 | 路径 | 说明 |
|------|------|------|
| 请求加字段 | `POST /api/holders` | `note`；`parent_id` 开始被校验 |
| 请求加字段 | `PATCH /api/holders/{id}` | `name`、`note`、`parent_id`（JSON null 表示脱离上级） |
| 响应加字段 | 持有方实体 | `note` |
| 语义变化 | `PATCH /api/statuses/{key}` | `requires_location` 对内置状态**不再被忽略** |
| 语义变化 | `POST /api/transfers` | `to_owner_id` 现在也用于签出 / 归还 / 转移（形状未变） |
| 无变化 | `GET /api/assets` | `holder_type` + `holder_id` 自 001 就支持，本轮只是前端补了入口 |

### 资源结构

**HolderEntity**

```diff
+ "note": "B 座三层，A01–A24 号货架"
  "parent_id": null        // 含义从「未使用」变成「按类型校验」
```

---

## 错误码

| 场景 | HTTP | `error.code` | `fields` | 消息示例 |
|------|------|--------------|----------|----------|
| 部门无上级 | 422 | `validation_failed` | `parent_id` | `部门必须属于一个公司，请先建立公司` |
| 上级类型不符 | 422 | `validation_failed` | `parent_id` | `部门只能属于公司，「种子仓库」是位置` |
| 移动成环 | 422 | `validation_failed` | `parent_id` | `不能把「运维部」挂到它自己或它的下级上` |
| 状态的位置约束拒绝持有方 | 422 | `validation_failed` | **`to_holder_id`** | `「在库」状态的持有方必须是一个位置` |

最后一条是**字段归属的修正**：此前它是 `illegal_transition`，挂在 `to_status` 上，
识别方式是在错误文本里找「位置」两个字。操作者动的是持有方，
收到的却是一句关于状态的话 —— 这就是用户报告的「文案和实际行为不符合」。
现在由 `transfer.ErrHolderKind` 哨兵驱动，`internal/httpapi/holders_test.go`
里有一条用例专门断言它**不**提及 `to_status`。

---

## 未变更的部分

- 流转请求的形状。`to_owner_id` 自 001 就存在；省略它仍然表示「负责人不变」。
- `GET /assets` 的筛选参数。
- 停用持有方的拦截规则与 `blockers` 载荷。
