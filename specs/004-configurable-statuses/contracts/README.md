# API 契约：相对 001–003 的增量

**Feature**: 004-configurable-statuses | **Date**: 2026-08-31

全局约定（认证、错误 envelope、分页、乐观锁、时间、命名、筛选参数）沿用
[001 的契约约定](../../001-asset-ledger-demo/contracts/README.md)，本文不重复。

**全量端点清单仍以 [001 的 openapi.yaml](../../001-asset-ledger-demo/contracts/openapi.yaml)
为准，该文件随本特性就地更新。** 本目录下的 [openapi.yaml](./openapi.yaml) 只描述增量。

---

## 变更清单

### 路径

| 变化 | 路径 | 说明 |
|------|------|------|
| **新增** | `GET /api/statuses` | 状态列表，裸数组。每个渲染徽章的页面都读它 |
| **新增** | `POST /api/statuses` | 新建自定义状态 |
| **新增** | `PATCH /api/statuses/{key}` | 改标签、颜色、排序；行为开关仅对自定义状态生效 |
| **新增** | `DELETE /api/statuses/{key}` | 删除自定义状态 |
| **新增** | `GET /api/status-usage` | 各状态的占用与历史提及次数 |

### 资源结构

**Status**（新增）

```json
{
  "key": "on_loan",
  "label": "外借中",
  "color": "violet",
  "sort": 60,
  "builtin": false,
  "requires_location": false,
  "counts_as_available": true,
  "terminal": false,
  "created_at": "2026-08-31T05:34:51Z",
  "updated_at": "2026-08-31T05:34:51Z"
}
```

`color` 是**色板槽位名**，枚举为 `slate|green|blue|amber|red|violet|teal|rose`，
不接受 `#RRGGBB`。理由见 research.md D3。

### 响应改动

`GET /api/overview` 的 `status_counts` 不再固定五项：
它按配置的状态枚举，并把配置中已不存在、但仍有资产持有的状态追加在末尾 ——
少了它们，卡片的和就对不上 `total`。

CSV 导出的「状态」列取自 `statuses.label`，不再是导出器里的一份硬编码副本。

---

## 错误码

| 场景 | HTTP | `error.code` | 消息示例 |
|------|------|--------------|----------|
| 键名不合规 / 颜色不在色板 | 422 | `validation_failed` | `状态键名只能是小写字母、数字与下划线，且以字母开头` |
| 键名重复 | 409 | `unique_conflict` | `状态键名 "in_stock" 已存在` |
| 删除内置状态 | 409 | `reference_blocked` | `「已报废」是内置状态，它承载着系统写死的行为，不能删除` |
| 状态仍有设备 | 409 | `reference_blocked` | `还有 1 台设备处于「外借中」，请先把它们改到别的状态`（带 `total`） |
| 流转的目标状态不存在 | 422 | `validation_failed` | 字段级：`to_status: 不是有效的状态` |

前两条在实现时最初落进了默认分支，返回 500。修法是给校验一个哨兵
（`schema.ErrStatusInvalid`）并在 `FailErr` 里映射 —— 与 003 的
`ErrModelDuplicate` 是同一类疏漏，`internal/httpapi/statuses_test.go` 现在盯着它。

---

## 未变更的部分

- `POST /api/transfers` 的入参形状不变，`to_status` 仍是一个字符串；
  变的只是它对照什么来校验（配置而非常量）。
- `kind` 的取值不变。自定义状态之间的移动落进既有的 `status_change` 分支。
- `assets` 的任何字段都没变。
