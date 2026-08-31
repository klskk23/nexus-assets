# API 契约：相对 001–005 的增量

**Feature**: 006-bilingual-and-holder-lifecycle | **Date**: 2026-08-31

全局约定沿用 [001 的契约约定](../../001-asset-ledger-demo/contracts/README.md)。

**全量端点清单仍以 [001 的 openapi.yaml](../../001-asset-ledger-demo/contracts/openapi.yaml)
为准，该文件随本特性就地更新。**

---

## 变更清单

### 全局：`Accept-Language`

**每一个端点**现在都读 `Accept-Language`，并按它渲染所有用户可见文本：
`error.message`、`error.fields.*` 的值、CSV 表头、导入模板的标题行、导入预览的每行问题。

- 支持 `zh` 与 `en`；按前缀匹配，`zh-CN`、`zh-TW`、`en-GB` 都认得。
- 不支持的语言（`fr-FR`）**回退到中文**，不是英文。
- 缺失的翻译回退到中文；缺失的键渲染为键本身 —— 看得见的缺陷好过看不见的空白。

**不随语言改变的**：`error.code`、`error.fields` 的**键**、导入模板的第二行（键名行）、
以及一切数据（类别名、状态标签、信息项显示名 —— 那些是管理员输入的内容）。

### 路径

| 变化 | 路径 | 说明 |
|------|------|------|
| **新增** | `DELETE /api/holders/{id}` | 删除持有方，取代 `PATCH` 的 `archive: true` |
| **新增** | `GET /api/holders/{id}/usage` | 删除的代价：`{assets, children, history}` |
| 请求去字段 | `PATCH /api/holders/{id}` 不再接受 `archive` | 停用机制移除 |
| 响应去字段 | 持有方不再有 `archived_at` | 同上 |

### 资源结构

**HolderEntity**

```diff
- "archived_at": null      // 停用机制不复存在
```

---

## 错误码

删除持有方的三种拒绝共用 409 与 `reference_blocked`，载荷不同：

| 场景 | 载荷 | 消息示例（en） |
|------|------|---------------|
| 有设备持有或引用 | `blockers` + `total` | `"上海仓库" is still in use by 2 device(s): SN-1 (held), SN-2 (referenced). Move or re-point them before deleting it.` |
| 有下级 | `total` | `"XX 集团" still has 1 item(s) under it. Move or delete them first.` |
| 是默认库存点 | —— | `"种子仓库" is the current default stock point. Move the default elsewhere before deleting it.` |

**仅在流转历史中出现不构成拒绝**（与 004 的状态删除同一条规则）。
代价由 `GET /holders/{id}/usage` 的 `history` 给出，供确认框事先说明。

---

## 未变更的部分

- 所有端点的请求形状。
- `error.code` 的取值集合。
- 分页、乐观锁、时间格式。
