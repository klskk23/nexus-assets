# API 契约：相对 001 的增量

**Feature**: 002-identity-and-transfer | **Date**: 2026-08-28

全局约定（认证、错误 envelope、分页、乐观锁、时间、命名、筛选参数）全部沿用
[001 的契约约定](../../001-asset-ledger-demo/contracts/README.md)，本文不重复。

**全量端点清单仍以 [001 的 openapi.yaml](../../001-asset-ledger-demo/contracts/openapi.yaml)
为准，该文件已随本特性就地更新。** 本目录下的 [openapi.yaml](./openapi.yaml)
只描述发生变化的路径与结构，便于评审时一眼看出改了什么。

---

## 变更清单

### 路径

| 变化 | 路径 | 说明 |
|------|------|------|
| **改名** | `POST /api/categories/:id/recompute-sn` → `POST /api/categories/:id/recompute` | 重算对象从编号扩大到全部表达式键，旧名字已经名不副实 |
| 参数改名 | `DELETE /api/assets/:id?confirm_sn=` → `?confirm=` | 确认的对象是显示编号，未配置时是 UUID 短码，叫 `sn` 会误导 |
| 响应改字段 | `GET /api/assets/:id` 的 `sn_history` → `value_history` | 从「编号的历史」推广为「任一唯一字段的历史」，结构也从字符串数组变为对象数组 |
| 响应删字段 | `GET /api/categories/:id/schema` 去掉 `sn_template` / `sn_template_from` | 编号规则不再属于类别；改为直接返回 `category` 对象，其中含 `display_key` |
| 请求改字段 | `POST` / `PATCH /api/categories` 的 `sn_template` → `display_key` | 从一段模板变成一个 key 的选择 |

新增与删除的端点：**均为 0**。

### 资源结构

**Asset**

```diff
- "sn": "112394521950"
+ "display_name": "112394521950"     // 派生，非存储；未配置显示编号时为 UUID 前 8 位
```

`id`（UUID）此前也在，但从「一个内部主键」变成**唯一的**标识 ——
所有对外指代都以它或它派生出的 `display_name` 进行。

**Category**

```diff
- "sn_template": "{{ .attrs.mac | hex2dec }}"
+ "display_key": "sn"                // 指向该类别有效字段集内某个标为唯一的 key；可为空串
```

**HistoricValue**（新增，`value_history` 的元素）

```json
{ "key": "mac", "value": "001A2B3C4D5E", "archived_at": "2026-08-28T09:15:00Z" }
```

**RecomputeReport**（`conflicts` 与 `samples` 的元素结构变化）

```diff
  conflicts: [
-   { "sn": "12345", "asset_ids": ["..."] }
+   { "key": "sn", "value": "12345", "assets": ["112394521950", "112394521951"] }
  ]
  samples: [
-   { "from": "112394521950", "to": "RT-112394521950" }
+   { "asset": "112394521950", "key": "sn", "from": "112394521950", "to": "RT-112394521950" }
  ]
```

冲突与样本都必须带 `key`：重算的对象不再只有编号一项，不说明是哪个键就无法判读。

### 搜索语义

`GET /api/assets?q=` 的精确匹配段从「`sn` / 历史 `sn` / `mac`」改为
「任一唯一信息项的当前值 → 任一唯一信息项的历史值 → 资产 UUID」。

请求形态不变，行为的差别在于**不再有任何字段名被硬编码**：
给某个字段勾上「唯一」，它当天就参与扫码直达。

命中多条时不再直达（`exact_match_id` 为空），退化为列表 ——
归档值允许被另一台设备重新占用，因此多命中是合法状态，猜一个跳过去比不跳更危险。

---

## 错误码

**无新增错误码。** 三类新拒绝复用既有的码：

| 场景 | code | HTTP |
|------|------|------|
| 表达式键的依赖未满足 | `validation_failed` | 422 |
| 显示编号指向的字段不唯一/未绑定/已停用 | `validation_failed` | 422 |
| 解绑被引用的字段 | `reference_blocked` | 409 |
| 取消默认库存点 | `validation_failed` | 422 |
| 停用当前默认库存点 | `reference_blocked` | 409 |

`message` 承载具体该先改什么。依赖未满足时会分类列出「库中不存在 / 尚未绑定 / 需要改必填」
三组 key —— 这类配置错误没有通用的补救办法，笼统的提示等于没提示。

## message 里不得出现英文标识

领域层的哨兵错误形如 `errors.New("holder entity is still referenced")`，
用于 `errors.Is` 判定。001 的 `FailErr` 把 `err.Error()` 整个透传，
于是这段英文出现在中文提示的前面：

```
holder entity is still referenced: 「上海仓库」仍被 5 台设备使用……
```

本特性新增剥离步骤，`message` 中只保留中文部分。这是章程原则 V 的要求，
不是本特性新引入的规则 —— 是 001 遗留的一处违反，在此一并修掉。
