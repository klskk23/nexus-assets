# 类别继承接口合约

本文件定义 031 的增量接口，路径均以 /api 为前缀。实现时必须同步 specs/001-asset-ledger-demo/contracts/openapi.yaml、internal/httpapi/docs/openapi.yaml 和 deploy/smoke.sh。

## 1. 创建与编辑仍使用原写入口

- POST /categories：创建类别，同时保存继承选择、编号与打印配置，成功 201。
- PATCH /categories/:id：一次保存完整草稿，成功 200。

新增请求成员：

```json
{
  "inherited_field_ids": ["field-uuid"],
  "confirmation_token": "opaque-token"
}
```

原有名称、代号、parent_id、display_key、print_preset_ids 保持对应入口的既有约束；创建入口必须接受 print_preset_ids，不能静默忽略新建草稿中的标签配置。

| 成员 | 省略 | 空集合 / null |
|---|---|---|
| inherited_field_ids，创建 | 不选任何字段 | [] 明确不选；null 非法 |
| inherited_field_ids，更新 | 不主动修改现有选择 | [] 清空；null 非法 |
| parent_id，更新 | 不移动 | null 移到根，仍须通过移动守卫 |
| confirmation_token | 无确认凭据 | 空字符串等同无凭据 |

更新父级且省略选择时，保留原选择与新父有效字段的字段 ID 交集，失去来源的项进入撤回影响；客户端显式提交的非法候选必须报错，不静默过滤。

输入集合去重并规范排序后计算确认摘要，不把字段提交顺序当业务变化。错误定位到 inherited_field_ids 或相关已有字段；不接受属于设备侧或不属于直接父类的字段。

原有 Category 成功响应形状不破坏；继承选择及候选由编辑预览提供，避免把候选加进普通 schema.fields。

## 2. 只读编辑预览

- POST /categories/preview：新建草稿预览。
- POST /categories/:id/preview：编辑草稿预览；{} 表示加载当前配置。

请求为相应写入口的草稿，不包含 confirmation_token。预览只读取一致快照，不写库、不产生审计记录、不占写事务来模拟回滚。

响应结构：

```json
{
  "category": {},
  "inheritance": {
    "parent_id": "category-uuid",
    "selected_field_ids": ["field-uuid"],
    "candidates": {
      "items": [
        {
          "field": {},
          "source_category_id": "original-binding-category-uuid",
          "selected": true
        }
      ],
      "total": 1,
      "offset": 0,
      "limit": 50
    }
  },
  "fields": [],
  "impact": {
    "added_count": 0,
    "removed_count": 0,
    "source_changed_count": 0,
    "category_count": 0,
    "asset_count": 0,
    "items": [],
    "total": 0,
    "offset": 0,
    "limit": 50
  },
  "issues": {"items": [], "total": 0, "offset": 0, "limit": 50},
  "requires_confirmation": false,
  "confirmation_token": ""
}
```

- category 是应用草稿后的投影，创建时可没有持久化 ID；不能为预览新建真实类别行。
- candidates 的 field 为字段定义；source_category_id 是原始类别绑定来源，不是直接父级的别名。
- fields 是草稿最终有效类别字段，用于编号候选，保持现有 schema 字段集语义；不混入未选候选或设备侧字段。
- impact.items 每项包含 category_id、field_id、key、change（added/removed/source_changed）、before_source_category_id、after_source_category_id。
- issues.items 每项包含 code、已本地化 message，以及适用的 category_id、field_id、field_key、asset_id、conflict_asset_id。显示编号可以辅助阅读，但操作必须按 UUID 定位。
- asset_count 是受影响资产去重数，不按多个字段或祖先路径累加。
- candidates、impact、issues 分别使用 candidates_offset/limit、impact_offset/limit、issues_offset/limit 查询参数，默认 50、上限 200。无论当前页大小如何，确认摘要覆盖完整影响集。
- 客户端换父时用完整当前草稿；只保留候选交集后再预览最终草稿。迟到响应不能覆盖更新的父级草稿。
- 语法错误返回 400；对象不存在返回 404。语法正确但业务有依赖问题时返回 200 + issues，使用户可以继续修正编号等配置；存在 issues 时无可提交确认凭据。

## 3. 确认与并发

继承撤回（含直接解绑导致的下游撤回）需要确认；显示本类别和后代的字段变化及去重资产数量。即使受影响资产数为零也需要确认。只有完整影响存在撤回且完整 issues 为空时才签发非空凭据；无撤回或有 issues 时凭据为空。没有撤回的普通改名不要求新确认。

凭据必须是服务端生成的不可伪造摘要，绑定操作、目标、规范化完整草稿、相关 schema、完整影响集合、相关资产身份/版本与校验数据。实现采用进程内随机密钥 HMAC-SHA256，不新增持久化密钥配置；重启后旧凭据失效，用户重新预览即可。不得把凭据当作写权限，所有请求仍重新执行权限和业务校验。

提交在写事务中重新计算。缺失凭据时返回 409 confirmation_required；已有凭据与当前请求或影响不一致时返回 409 impact_stale。两者都零写入，使用既有 error envelope 和 userText。

客户端保留草稿，刷新预览并由用户再次确认；禁止自动接受新 token 后重试写入。确认期间冻结待提交草稿，修改任何草稿成员即废弃旧确认。

其他字段及依赖错误沿用既有 400/409 分工，响应 error.fields 定位输入；不得用凭据跳过恢复值或唯一性校验。

普通资产保存和导入提交的 Prepared 若使用过时 schema，返回 `409 schema_stale`，在当前事务中零写入；导入整批回滚并要求刷新预览。该错误使用同一错误信封和双语目录，前端保留输入，不自动重试可能改变校验/计算结果的写入。

## 4. 直接解绑

- POST /categories/:id/bindings/:field_id/unbind-preview：只读预览，返回同形 impact、issues、requires_confirmation、confirmation_token。
- DELETE /categories/:id/bindings/:field_id：接受可选 JSON 对象 {"confirmation_token":"..."}，成功返回 204，无响应体。

不需要新确认的既有请求仍可无 body；需要确认的传播不能因旧客户端没有 token 就被放行。使用与类别编辑相同的领域 planner、守卫和事务。取消或失败时直接绑定及下游选择均保持不变。

型号与厂商解绑不套用本轮类别继承选择语义。

## 5. 必填影响计数

新增 GET /fields/:id/asset-count，返回 {"count": N}（N 为非负整数；不是列表信封）。按字段 ID 的实际有效到达范围计算去重资产数，包含类别、型号及厂商的既有对应规则，不将祖先整个子树视为继承结果。前端必填提示使用此结果，避免多个绑定逐个计数再相加。

该计数只读且沿用读默认开放规则；不增加权限开关。

## 6. 权限与现有读接口

- 写入口继续由 schema.manage 服务端守卫。
- 预览不写数据，沿用元数据读开放策略（在既有身份认证边界内），无管理权限前端仍禁用编辑；服务端写入口不得依赖预览权限作保证。
- GET /categories/:id/schema 保持 category + fields：无 model_id 返回类别有效集，有 model_id 再包含该资产实际设备字段。
- GET /fields 的 category_ids 保持直接绑定事实；category_id 过滤依据实际有效到达，不能扩大 category_ids 的含义。
- 本轮响应字段和错误目录中英齐备；键、UUID、路径和 error.code 不翻译。

## 7. 合约测试要求

覆盖创建省略/空/null、更新省略/空/null、parent_id 三态、非法候选、编号候选随草稿改变、预览零写入、完整影响分页与去重、缺少确认、过时确认、同数量不同资产的竞争、依赖与唯一冲突回滚、直接解绑确认和权限。新路由在 smoke 中至少验证身份、成功或合法拒绝响应形状，不仅检查状态非 404。
