# 接口契约：厂商与字段组

写进 `specs/001-asset-ledger-demo/contracts/openapi.yaml`，并同步到
`internal/httpapi/docs/openapi.yaml`（有测试盯两者一致）。

## 厂商

沿用列表的两种形状（014 决策 92）：带 `q`/`offset`/`limit` 返回信封，
一个都不带返回**数组**。下拉框要全集，分页会截断选项。

```
GET    /api/vendors                → [{id,name,model_count}] 或 {items,total,offset,limit}
POST   /api/vendors                {name}                    → 201 {id,...}
PATCH  /api/vendors/:id            {name}                    → 200
DELETE /api/vendors/:id                                      → 204
                                   409 + {total} 当仍有型号引用
GET    /api/vendors/:id/required-impact → {total}   该厂商旗下全部型号的资产台数
POST   /api/vendors/:id/bindings   {field_id, sort?}         → 204
DELETE /api/vendors/:id/bindings/:field_id                   → 204
```

`required-impact` 与 `/models/:id/required-impact` 同形：勾必填之前要知道波及多少台。

## 字段组

```
GET    /api/field-groups                     → [{id,name,field_ids}] 或信封
POST   /api/field-groups   {name, field_ids?}                → 201
PATCH  /api/field-groups/:id {name?, field_ids?}             → 200   field_ids 给了则整体替换
DELETE /api/field-groups/:id                                 → 204   不解除任何已展开的绑定
```

**绑定一个组**：不是新端点，而是既有绑定端点接受 `group_id` 取代 `field_id`。

```
POST /api/categories/:id/bindings  {group_id}   → 204 或 409
POST /api/models/:id/bindings      {group_id}   → 204 或 409
POST /api/vendors/:id/bindings     {group_id}   → 204 或 409
```

一个请求一个事务：组内每个成员逐个走既有的绑定校验，**任一失败则整体回滚**，
409 的 message 点名是哪个字段、卡在哪里（决策 106）。
`field_id` 与 `group_id` 二选一，都给或都不给是 400。

**没有「解绑一个组」的端点。** 组展开后不留痕迹，「解绑组」无从定义 ——
要解绑就一个个解，或者从字段编辑器里取消勾选。

## 型号

```
POST/PATCH /api/models   {..., vendor_id?}      vendor 字符串字段移除
GET  /api/models/:id/vendor-change-impact?vendor_id=<新厂商> → {total, fields:[label]}
```

最后这个是决策 112 的 dry-run：改厂商之前告诉你会让多少台设备的哪些字段变成只读历史。
`vendor_id` 传空表示改成「没有厂商」。

## 字段行的形状变化

`GET /api/fields` 与 `GET /api/categories/:id/schema` 的每一项：

```jsonc
{
  "key": "servicetag",
  "binding_mode": "device",        // 原 category|model|unbound → category|device|unbound
  "category_ids": [],
  "vendor_ids": ["v-dell"],        // 新增：绑在哪些厂商
  "model_ids": ["m-620", "m-640"], // 含义变了：到达集 = 直绑 ∪ 厂商展开
  "group_ids": ["g-net"]           // 新增：属于哪些组，供字段页筛选
}
```

`model_ids` 从「绑在哪些型号」变成「到达哪些型号」是本轮唯一一处**含义变化而形状不变**的地方。
这是刻意的：前端四处判定（列解锁、`ForModel`、`AppliesTo`、导入不匹配拒绝）本来就该按到达集判，
它们一行都不用改。要知道「绑在哪」的地方只有字段表的绑定列和编辑器，它们改读 `vendor_ids`。

## 筛选参数

```
GET /api/fields?group_id=<id>       新增
GET /api/fields?vendor_id=<id>      新增
GET /api/assets?vendor_id=<id>      新增；无 group_id，资产与组之间没有边
```

## 导入

CSV 的 `vendor` 列语义从「同名型号的消歧字符串」变成「按名字查厂商」。
查不到 → 预览阶段拒绝该行，**不创建厂商**（决策：导入不创建主数据，
与找不到持有方、找不到型号同一条规则）。

## 错误码

沿用既有的：绑定冲突 `unique_conflict`，引用阻挡 `reference_blocked`，
校验失败 `validation_failed`。**不新增 error.code。**

## 权限

全部沿用 `schema.manage`，不新增开关（决策：权限是十八个全局开关，本轮不变成十九个）。
