# 任务：026（实现后回填的清单）

本轮按分支推进而非先列任务；下面是实际做过的，保留是为了让后来者看见顺序与代价。

## Phase 1 服务端：可搜索
- [X] T001 迁移 022：`field_definitions.searchable`、存量全置 1、新表 `asset_search_values`
- [X] T002 **迁移回填存量** —— 走查发现漏了，命中 0 台。补上后 180 行入索引
- [X] T003 `searchValues` / `syncSearchValues`，挂在唯一值同一处事务
- [X] T004 重算也同步（计算字段的值会变）
- [X] T005 搜索读两张表；`exactMatch` 仍只读唯一表
- [X] T006 `UpdateField` 支持改开关并**立即回填**
- [X] T007 五条搜索测试 + 两条回填测试 + 一条迁移回填测试

## Phase 2 服务端：解耦
- [X] T008 `FieldsForAsset(path, modelID)`；`EffectiveFields` 只答类别链
- [X] T009 `EveryPossibleField` 给 CSV 的列
- [X] T010 `/categories/:id/schema?model_id=`
- [X] T011 导入的 resolve/rows 改用宽集（否则型号列被当成未知列静默丢弃）
- [X] T012 翻转四条编码了旧前提的测试，各写明为什么

## Phase 3 服务端：键冲突
- [X] T013 `assertKeyFreeForCategory` / `assertKeyFreeForDevice`，三处绑定都接上
- [X] T014 `nexus verify` 报告存量冲突
- [X] T015 翻转「厂商的型号不在那条链上就不冲突」那条

## Phase 4 前端
- [X] T016 字段表单的「可搜索」开关（唯一时勾上且禁用）
- [X] T017 没选类别时列的池子取全库字段
- [X] T018 型号筛选脱离类别；厂商缩小型号候选，单向
- [X] T019 十二处无界下拉换 `SearchSelect`
- [X] T020 白名单守卫 `tests/searchableSelects.test.ts`

## Phase 5 收尾
- [X] T021 两份合约、`docs/rules/schema.md`、`docs/rules/web-tables.md`
- [X] T022 七条门禁 + 真实库副本上的迁移验证
- [X] T023 一次提交，**不推送**
