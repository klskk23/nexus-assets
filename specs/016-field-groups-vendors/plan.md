# 实施计划：字段组与厂商实体

**分支**：`016-field-groups-vendors` ｜ **规格**：[spec.md](./spec.md) ｜ **决策**：105–113

## 技术背景

沿用既有技术栈，不引入任何新依赖。

| | |
|---|---|
| 服务端 | Go 1.26 · Gin · modernc 纯 Go SQLite（`CGO_ENABLED=0`）· goose 迁移（embed.FS） |
| 前端 | React 19 · Vite 6 · Tailwind v4 · shadcn/ui · TanStack Query v5 · react-router v7 |
| 测试 | Go `testing`（真 SQLite 临时库，不 mock 存储层）· Vitest 3 + RTL + jsdom |
| 迁移号 | **019** |

**没有 NEEDS CLARIFICATION。** 八个设计分支在 `/grill-me` 里逐个表决过，
三条推定项（display_key 仍限类别、权限沿用、组可绑厂商）也单独确认过。

## 章程检查

| 原则 | 本轮如何满足 |
|---|---|
| 一、组件必须来自 shadcn/ui | 厂商页走 `CrudPage`；组的成员选择用既有的复选框栅格；页签用 `Tabs`。**不新增自定义组件** |
| 二、前端必须含 DOM 测试 | 厂商 CRUD、组绑定的整组拒绝、勾选框禁用与说明、两个新筛选，各有 RTL 用例 |
| 三、文档中文、代码英文；文案两种语言 | 新增文案同时进 `zh.ts` / `en.ts`（`typeof zh` 约束）与 `internal/i18n/catalog.go`（有 parity 测试） |
| 四、核心管线覆盖率 ≥ 80% | 厂商继承落在 `internal/schema`（现 80.2%），新增逻辑必须带够测试，不得把它压到 80 以下 |
| 五、每个端点有集成测试，跑真 SQLite | 8 个新端点 + 3 个改动端点，全部在 `internal/httpapi` 加集成测试 |
| 无 N+1 | 厂商绑定与厂商→型号同样**全量加载后内存合成**，与既有两条同形；解析的查询数仍是常数 |
| gocyclo ≤ 15 | `FieldsOfPath` 会再长一段，超限就把厂商那一层抽成 `resolveVendorFields` |

**没有需要豁免的条目。**

## 项目结构

```
migrations/019_field_groups_vendors.sql        新

internal/model/model.go                        Vendor 结构；BoundField 加 VendorIDs
internal/schema/vendor_store.go                新：厂商 CRUD、vendor_fields 读写、旗下型号
internal/schema/group_store.go                 新：组 CRUD、成员、展开绑定
internal/schema/binding.go                     互斥改判「类别 vs 设备」
internal/schema/model_binding.go               bindModelTx 只查 category_fields
internal/schema/resolve.go                     resolveVendorFields，并进到达集
internal/schema/field_store.go                 deleteFieldTx 补删 vendor_fields
internal/schema/model_store.go                 vendor 字符串 → vendor_id
internal/importer/resolve.go                   vendor 列改查厂商实体，查不到拒绝该行
internal/compute/eval.go                       model.vendor 仍解析为厂商名（不变但要有测试）
internal/httpapi/handlers_vendors.go           新
internal/httpapi/handlers_groups.go            新
internal/httpapi/handlers_metadata.go          fieldRow 加 vendor_ids/group_ids；binding_mode 取值改
internal/httpapi/server.go                     8 条新路由

web/src/routes/Vendors.tsx                     新（CrudPage）
web/src/routes/FieldGroups.tsx                 新（CrudPage）
web/src/routes/Models.tsx                      vendor_id；页签导航
web/src/routes/Fields.tsx                      组与厂商两个筛选；绑定列认厂商
web/src/routes/Assets.tsx                      厂商筛选
web/src/features/fields/FieldForm.tsx          设备模式下同时选型号与厂商；勾选框禁用
web/src/routes/router.tsx                      /models/vendors、/field-groups
```

## 阶段

### 第 0 阶段：调研 ✅

见 [research.md](./research.md)。三个结论：

1. **表达式唯一索引在本项目的驱动上可行**，且 `ifnull` 折叠出的语义正是要的
2. **`model.vendor` 暴露给了表达式引擎** —— 实体化后它必须继续解析为**厂商名字符串**，
   否则已有的编号表达式会静默算出别的值，而「改表达式即重算」不会被触发。**本轮最大的暗雷**
3. 厂商层插在 `FieldsOfPath` 的第二步里，`Resolve` 的出参形状不变

### 第 1 阶段：设计 ✅

- [data-model.md](./data-model.md) —— 迁移 019、三张新表、表达式唯一索引、回填顺序
- [contracts/vendors-and-groups.md](./contracts/vendors-and-groups.md) —— 8 个新端点、字段行形状
- [quickstart.md](./quickstart.md) —— 15 步实机走查

### 第 2 阶段：实施顺序

依赖决定顺序，不是价值：

```
019 迁移 ─┬─ 厂商实体（CRUD + 型号引用）──┬─ 厂商绑定 ── 实时继承 ── 到达集/接口形状 ── 前端
          │                              └─ 换厂商 dry-run 与归档
          └─ 字段组（CRUD + 展开绑定）────── 组的整组拒绝
```

**互斥规则的改写要走在厂商绑定前面** —— 否则第一条厂商绑定就会撞上「类别 vs 型号」的旧判定。

**字段组与厂商这两条线除了迁移之外互不依赖**，可以并行，也可以只做一条就发布：
US2（组）不需要厂商，US1（厂商继承）不需要组。

## 风险

| 风险 | 应对 |
|---|---|
| **表达式读 `model.vendor` 静默变值** | 迁移前后同一表达式同一结果，写成测试（quickstart 第 3 步） |
| **迁移在存量库上失败** | 按原样不归并（FR-009），使新旧唯一约束一一对应；并在含大小写不一致数据的库上实测（第 1 步） |
| 删除字段时漏删 `vendor_fields` | 与 017 同一个坑（v0.8.3 的 500）。`deleteFieldTx` 显式补删，并加测试 |
| 到达集把 `model_ids` 的含义改了 | 形状不变、含义变，最容易被下一个人读错。合约与 `BoundField` 的注释都要写明；变量名用 `reaches` 而非 `bound` |
| `/models` 与 `/models/vendors` 抢地址栏 | 两条独立路由，不是一个地址两张表 |
| 前端 24 个文件涉及 vendor | 大多只是展示，但 `useColumns`、`ModelPicker`、导出对话框要逐个过 |
