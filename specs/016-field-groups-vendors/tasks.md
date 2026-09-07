# 任务：字段组与厂商实体

**规格**：[spec.md](./spec.md) ｜ **计划**：[plan.md](./plan.md) ｜ **决策**：105–113

`[P]` = 可与相邻任务并行（不同文件、无未完成依赖）。
`[US1]`–`[US4]` = 服务于哪个用户故事。

---

## 第 1 阶段：迁移（阻塞其余一切）

- [X] T001 在 `migrations/019_field_groups_vendors.sql` 建 `vendors`、`field_groups`、`field_group_members`、`vendor_fields` 四张表，并给 `vendor_fields(field_id)` 建反向索引；注释写明为什么组的两处外键用 ON DELETE CASCADE 而绑定表不用（成员关系丢了不损失任何人填过的东西）
- [X] T002 在同一迁移里给 `product_models` 加 `vendor_id TEXT REFERENCES vendors(id)`，按**每个不同字符串一个厂商**回填，`vendor=''` 留 NULL；注释写明绝不归并的理由（归并会撞唯一索引，让迁移在生产库上失败）
- [X] T003 在同一迁移里换唯一约束：删掉既有的 `UNIQUE(vendor, name)`，建 `CREATE UNIQUE INDEX ux_models_vendor_name ON product_models(ifnull(vendor_id,''), name)`；顺序必须是先回填后建索引
- [X] T004 写 down 迁移：从 `vendor_id` 反填回旧的 `vendor` 文本列（该列保留不删），还原旧索引，drop 四张新表
- [X] T005 在 `internal/store/migrate_test.go` 的两处硬编码版本清单前面加 `"019"`（015 那轮忘了这一步，测试当场红）
- [X] T006 在 `internal/store/migrate_test.go` 加测试：在含 `(Dell,X1)`、`(DELL,X1)`、`('',X1)` 三行的库上跑 019，断言得到两个厂商实体、第三款 `vendor_id` 为 NULL、三款型号都在、**没有归并**；再插一款 `vendor_id=NULL, name=X1` 断言被唯一索引拒绝（这是迁移 003 那个 bug 的回归）

## 第 2 阶段：地基（阻塞所有用户故事）

- [X] T007 在 `internal/model/model.go` 加 `Vendor` 结构，并给 `BoundField` 加 `VendorIDs []string`
- [X] T008 新建 `internal/schema/vendor_store.go`：厂商 CRUD、`VendorsOfField`、`ModelsOfVendor`、`VendorFieldsByVendor`（全量加载，禁止按行查询）
- [X] T009 在 `internal/schema/vendor_store.go` 加删除守卫：仍有型号引用时拒绝并给出台数（与删除类别、状态同一条规则）
- [X] T010 `internal/schema/model_store.go`：`vendor` 字符串换成 `vendor_id`，保持 `GET /models` 的两种形状（014 决策 92）不变
- [X] T011 [P] `internal/compute/eval.go` 与 `internal/asset/recompute.go`：确认 `model.vendor` 仍解析为**厂商名字符串**，并在 `internal/compute` 加测试锁住它 —— 这是 research.md 点名的暗雷，表达式静默变值不会触发「改表达式即重算」

## 第 3 阶段：US1 厂商继承（P1，MVP）

- [X] T012 [US1] `internal/schema/binding.go`：互斥判定从「类别 vs 型号」改为「类别 vs 设备」，`bindTx` 同时查 `model_fields` 与 `vendor_fields`
- [X] T013 [US1] `internal/schema/model_binding.go`：`bindModelTx` 只查 `category_fields`，**不再**与厂商互查（同属设备侧，允许并存）
- [X] T014 [US1] `internal/schema/vendor_store.go`：`bindVendorTx` / `UnbindVendor`，键冲突检查照搬 `modelKeyFree` 的形状，作用范围是该厂商旗下型号所在的类别链
- [X] T015 [US1] `internal/schema/resolve.go`：新增 `resolveVendorFields`，把厂商绑定的字段按旗下型号摊开，与型号自绑的合并去重，填进 `ModelIDs`（到达集）与 `VendorIDs`（绑在哪）
- [X] T016 [US1] `internal/schema/binding.go` 的 `FieldsOfPath` 并入厂商层；超 gocyclo 15 就抽函数
- [X] T017 [US1] `internal/schema/field_store.go`：`deleteFieldTx` 补删 `vendor_fields` —— 与 017 同一个坑，v0.8.3 的 500 就是漏了这一行
- [X] T018 [P] [US1] `internal/schema/store_test.go` 加测试：厂商字段出现在旗下每款型号的有效字段集里；新建型号自动获得；无厂商型号拿不到
- [X] T019 [P] [US1] `internal/schema/store_test.go` 加测试：类别与设备侧互斥仍成立，型号与厂商可并存
- [X] T020 [P] [US1] `internal/schema/store_test.go` 加测试：唯一性范围是「直绑型号 ∪ 厂商旗下型号」，两款不同 Dell 型号上同值被拒
- [X] T021 [US1] `internal/httpapi/handlers_vendors.go` + `server.go`：厂商 CRUD、`/vendors/:id/bindings`、`/vendors/:id/required-impact`
- [X] T022 [US1] `internal/httpapi/handlers_metadata.go`：`fieldRow` 加 `vendor_ids`、`group_ids`；`binding_mode` 取值改 `category|device|unbound`；`model_ids` 改为到达集
- [X] T053 [US1] `internal/schema/category_store.go`：display_key 的守卫第二段现在只查 `model_fields`，厂商绑定的字段会掉到最后一个分支被告知「字段未绑定」—— 而它绑着，且用户在类别 schema 里看得见它。把 `vendor_fields` 并进那一查，并让文案对两种设备绑定都成立；加测试（FR-017）
- [X] T023 [P] [US1] `internal/httpapi/vendors_test.go` 新建：厂商 CRUD、绑定、删除守卫、字段行形状，各一条集成测试（真 SQLite）

## 第 4 阶段：US2 字段组（P2，与第 3 阶段并行）

- [X] T024 [US2] 新建 `internal/schema/group_store.go`：组 CRUD、成员整体替换、`GroupsOfField`
- [X] T025 [US2] `internal/schema/group_store.go`：`BindGroup(target, groupID)` 在一个事务里逐个走既有绑定校验，任一失败整体回滚并点名该字段与冲突所在
- [X] T026 [US2] `internal/httpapi/handlers_groups.go` + `server.go`：组 CRUD；三个既有绑定端点接受 `group_id` 取代 `field_id`，二选一，都给或都不给是 400
- [X] T027 [P] [US2] `internal/httpapi/groups_test.go` 新建：绑组等价于逐个绑；整组拒绝后**一行都没写**；删除组不解除已展开的绑定；同一字段经两个组绑同一目标只产生一条

## 第 5 阶段：US4 换厂商（P3）

- [X] T028 [US4] `internal/schema/model_store.go`：`VendorChangeImpact(modelID, newVendorID)` 返回波及台数与会变成只读的字段名
- [X] T029 [US4] `internal/httpapi`：`GET /models/:id/vendor-change-impact`
- [X] T030 [P] [US4] `internal/httpapi` 加集成测试：改厂商后旧厂商字段的值出现在 `archived_attrs` 里，且 dry-run 报的台数与实际一致

## 第 6 阶段：导入导出

- [X] T031 `internal/importer/resolve.go`：vendor 列从「同名型号消歧字符串」改为「按名字查厂商」，查不到则预览阶段拒绝该行且不创建厂商
- [X] T032 [P] `internal/importer/importer_test.go` 加测试：vendor 列指向不存在的厂商 → 该行被拒、厂商表没有新增
- [X] T033 确认导出与模板的列由类别完整有效字段集决定，现在含厂商字段；加一条测试锁住

## 第 7 阶段：前端

- [X] T034 [P] `web/src/lib/metaTypes.ts` / `types.ts`：`vendor_ids`、`group_ids`、`binding_mode` 取值、`ProductModelRow.vendor_id`
- [X] T035 [US1] `web/src/routes/Vendors.tsx` 新建（`CrudPage`）；`router.tsx` 加 `/models/vendors`；型号页加页签导航，**两条独立路由**，不能一个地址两张 CrudPage 否则 `q`/`offset` 互踩
- [X] T036 [US1] `web/src/features/fields/FieldForm.tsx`：设备模式下同时提供型号与厂商两组勾选；厂商已提供的型号勾选框禁用并说明，与同链类别置灰同一做法
- [X] T037 [P] [US2] `web/src/routes/FieldGroups.tsx` 新建（`CrudPage`），成员用既有的复选框栅格；`router.tsx` 加 `/fields/groups`，与字段页共用页签，**不单占导航栏一格**
- [X] T038 [US2] 字段组页的行右键菜单支持「绑定到…」（类别 / 型号 / 厂商）——
  原本写在字段编辑器里，但绑组是对目标做的事而不是字段的属性，且那个控件从未被渲染过
- [X] T039 [US3] `web/src/routes/Fields.tsx`：绑定列认厂商（读 `vendor_ids`）；新增组与厂商两个筛选，进地址栏
- [X] T040 [US3] `web/src/routes/Assets.tsx`：新增厂商筛选，进地址栏；**不加组筛选**
- [X] T041 [US4] `web/src/routes/Models.tsx`：厂商改成 `Select` 选实体；改厂商前拉 `vendor-change-impact` 并确认
- [X] T042 [P] `web/tests/vendors.test.tsx` 新建：厂商 CRUD 的 DOM 测试
- [X] T043 [P] `web/tests/fieldGroups.test.tsx` 新建：组 CRUD 与整组拒绝的 DOM 测试
- [X] T044 [P] `web/tests/fieldEditor.test.tsx` 加：厂商已提供的型号勾选框禁用并有说明
- [X] T045 [P] `web/tests/assets.test.tsx` / `metadata.test.tsx` 加：厂商筛选进地址栏；资产页没有组筛选

## 第 8 阶段：收口

- [X] T046 两份 i18n 同步：`zh.ts`/`en.ts`（`typeof zh` 约束）与 `internal/i18n/catalog.go`（parity 测试）
- [X] T047 合约：新端点、字段行新形状、`binding_mode` 新取值写进 `specs/001-asset-ledger-demo/contracts/openapi.yaml`，并 `cp` 到 `internal/httpapi/docs/openapi.yaml`
- [X] T048 `deploy/smoke.sh` 加一条厂商端点的存在性检查（章程要求改了端点就要改冒烟脚本）
- [X] T049 `CLAUDE.md` 加硬规则：三个绑定目标与「类别 vs 设备」互斥；组是绑定时展开的糖，解析路径不认识它；`model_ids` 是到达集不是绑定集；`model.vendor` 在表达式里仍是厂商名
- [X] T050 `docs/zenith-printer.md` 与 `.en.md` 一起改：`/api/rows` 的列现在也可能来自厂商绑定
- [X] T054 `internal/httpapi` 加权限测试：8 个新端点在缺少 `schema.manage` 时全部 403 —— 漏一个 `need(...)` 就是一条未设防的路由，而权限是「十八个全局开关」，本轮不新增第十九个（FR-027）
- [X] T051 跑完整门禁（章程七条）：`gofmt -l` 空、`go vet`、`golangci-lint` 零告警；`go test ./...` 全过且 `internal/schema` 与 `internal/asset` 覆盖率 ≥ 80%；`nexus verify` 通过；`npx tsc --noEmit`、`eslint`、`vitest run`、`npm run build` 全过；真镜像 `deploy/smoke.sh` 通过
- [X] T052 按 [quickstart.md](./quickstart.md) 起本地服务实机走完 15 步，**迁移那几步必须在含存量数据的库上做**

---

## 依赖与并行

```
第 1 阶段（T001–T006）── 阻塞一切
        │
第 2 阶段（T007–T011）── 阻塞所有用户故事
        │
        ├─ 第 3 阶段 US1 厂商 ─┬─ 第 5 阶段 US4 换厂商
        │                      └─ 第 6 阶段 导入导出
        └─ 第 4 阶段 US2 组 ────（与 US1 互不依赖）
                    │
              第 7 阶段 前端（依赖 T022 的接口形状）
                    │
              第 8 阶段 收口
```

**T012 必须走在 T014、T021 前面** —— 否则第一条厂商绑定就撞上旧的「类别 vs 型号」判定。

**MVP = 第 1、2、3 阶段**（T001–T023）：厂商实体 + 实时继承。
到这里 US1 完整可用，可以单独发布；组、换厂商 dry-run、筛选都还没有，但没有它们系统也自洽。

**任务总数 54，其中 16 个标了 `[P]`。**

交叉分析补入 T053（display_key 守卫漏掉厂商）与 T054（新端点的权限测试）。
