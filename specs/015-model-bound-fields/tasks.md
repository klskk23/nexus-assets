# Tasks: 字段可以绑定型号

**Feature**: `015-model-bound-fields` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

**测试是强制的**，不是可选：章程原则 II 为 NON-NEGOTIABLE，且本轮触及六块核心管线中的
两块（继承字段集解析、唯一性校验），触及 UI 的部分必须有 DOM 测试。

**路径约定**：仓库根为 `/home/land/project/nexus-assets`，下列路径均相对于它。

---

## Phase 1 · Setup

- [ ] T001 在 `migrations/017_model_fields.sql` 建 `model_fields(model_id, field_id, required, sort)` 表，主键 `(model_id, field_id)`、`ON DELETE CASCADE` 跟随型号，并建反向索引 `ix_model_fields_field(field_id)`；down 迁移直接 drop，不回填任何数据
- [ ] T002 运行 `go test ./internal/store/...` 确认迁移在全新库与既有库上都能跑通（goose 幂等）

---

## Phase 2 · Foundational（阻塞全部用户故事）

**这一阶段是决策 101 的落点：改这里，五个消费方自动跟上。完成前任何故事都动不了。**

- [ ] T003 在 `internal/model/model.go` 给 `BoundField` 加 `ModelIDs []string`（类别模式为空切片），不动其余字段
- [ ] T004 新建 `internal/schema/model_binding.go`：`ModelBindings(ctx)` 全量加载 `model_fields`（与既有 `BindingsByCategory` 同一模式，禁止按行查询）、`BindModel`/`UnbindModel` 的事务函数骨架
- [ ] T005 在 `internal/schema/binding.go` 抽出键冲突检查为独立函数，供类别绑定与型号绑定共用，避免把 `bindTx` 推过 gocyclo 上限
- [ ] T006 在 `internal/schema/resolve.go` 新增 `resolveModelFields`：取「注册在该类别链上的型号」（经 `product_model_categories`）绑定的字段，全量加载后内存取交集
- [ ] T007 在 `internal/schema/binding.go` 的 `EffectiveFields` 里并入 `resolveModelFields` 的结果，并给每个条目填上 `ModelIDs`
- [ ] T008 [P] 在 `internal/schema/store_test.go` 加测试：`EffectiveFields` 同时返回类别模式与型号模式字段，且类别模式条目的 `ModelIDs` 为空
- [ ] T009 [P] 在 `internal/schema/store_test.go` 加测试：型号未注册到该类别时，其绑定字段不出现在该类别的有效字段集里

---

## Phase 3 · User Story 1（P1）：给特定型号配一个专属字段

**目标**：管理员能建一个只属于某几个型号的字段，录入这些型号的设备时它出现，别的型号不出现。

**独立验收**：建一个型号模式字段，用两个不同型号各录一台设备，验证字段只在其中一台的表单上出现。

### 服务端

- [ ] T010 [US1] 在 `internal/schema/model_binding.go` 实现互斥校验：绑型号前查 `category_fields` 是否已有该 `field_id`，有则返回 `ErrBindingModeConflict`（反向同理，在 `bindTx` 里查 `model_fields`）
- [ ] T011 [US1] 在 `internal/schema/model_binding.go` 实现型号绑定的键冲突检查：查这些型号各自注册的类别链与子树内有无同 `key` 字段（复用 T005 抽出的函数）
- [ ] T012 [US1] 在 `internal/asset/save.go`（或唯一性写入处）让型号模式字段的 `asset_unique_values.scope_id` 取 `f:<field_id>`，类别模式保持存类别 id
- [ ] T013 [US1] 在 `internal/schema` 的 `display_key` 校验路径拒绝型号模式字段，返回 `ErrDisplayKeyNotCategoryField`
- [ ] T014 [US1] 在 `internal/asset/save.go` 实现换型号归档：`model_id` 变更时比较新旧型号的有效字段集，把不再适用且有值的键移入 `archived_attrs`，不阻断保存
- [ ] T015 [US1] 在 `internal/httpapi` 加端点 `POST /api/models/:id/fields` 与 `DELETE /api/models/:id/fields/:fieldId`，权限 `need(authz.SchemaManage)`，handler 只做绑定与 error envelope 转换
- [ ] T016 [US1] 在 `internal/httpapi/handlers_metadata.go` 让 `GET /categories/:id/schema` 的 `fields[]` 带上 `model_ids`
- [ ] T017 [US1] 在 `internal/schema/field_store.go` 让 `GET /fields` 的每项带上 `binding_mode` 与 `model_ids`
- [ ] T018 [US1] 在 `internal/i18n/keys.go` 与 `catalog.go` 加中英双语文案：`field_binding_mode_conflict`、`display_key_not_category_field` 的 message
- [ ] T019 [US1] 在 `internal/httpapi/errors.go` 的 refusals 表登记两个新 sentinel 与对应 HTTP 状态（409 / 422）

### 服务端测试

- [ ] T020 [P] [US1] 在 `internal/httpapi/` 加集成测试：已有类别绑定的字段再绑型号返回 409 `field_binding_mode_conflict`，反向亦然
- [ ] T021 [P] [US1] 在 `internal/httpapi/` 加集成测试：同一字段绑到两个型号后，这两个型号下的资产之间 ServiceTag 不可重复（跨型号唯一，决策 99）
- [ ] T022 [P] [US1] 在 `internal/httpapi/` 加集成测试：把型号模式字段设为类别 `display_key` 被拒（422）
- [ ] T023 [P] [US1] 在 `internal/httpapi/` 加集成测试：资产换型号后旧字段值进 `archived_attrs`，保存本身不失败
- [ ] T024 [P] [US1] 在 `internal/httpapi/` 加集成测试：型号模式字段绑定后，`GET /categories/:id/schema` 返回它且 `model_ids` 正确

### 前端

- [ ] T025 [US1] 在 `web/src/lib/types.ts` 给字段类型加 `model_ids` 与 `binding_mode`
- [ ] T026 [US1] 在 `web/src/features/fields/FieldEditor.tsx` 加绑定模式切换（`ToggleGroup`，两个选项）与型号多选（复用既有 `Checkbox` 列表形态），已有另一种绑定时禁用切换并说明原因
- [ ] T027 [US1] 在 `web/src/features/assets/DynamicForm.tsx` 或其调用处，按资产的 `model_id` 过滤掉 `model_ids` 非空且不命中的字段
- [ ] T028 [US1] 在 `web/src/i18n/zh.ts` 与 `en.ts` 加文案：绑定模式两个选项名、「绑定到型号」区标题与说明、混绑拒绝提示

### 前端测试（DOM，强制）

- [ ] T029 [P] [US1] 在 `web/tests/fieldEditor.test.tsx` 加 DOM 测试：切到型号模式后能勾选型号并提交，请求体正确
- [ ] T030 [P] [US1] 在 `web/tests/fieldEditor.test.tsx` 加 DOM 测试：字段已绑类别时，型号绑定入口为禁用状态且给出原因
- [ ] T031 [P] [US1] 在 `web/tests/newAsset.test.tsx` 加 DOM 测试：录入表单在选中绑定型号时出现该字段，换成未绑定的型号后消失

**验收点**：跑通 quickstart 第 1–6 步。

---

## Phase 4 · User Story 2（P2）：列表按型号筛选并看到专属字段列

**目标**：仓管能筛到某个型号，并把它的专属字段作为一列看。

**独立验收**：在已有型号模式字段的前提下，用列表页的筛选与显示列完成一次核对。

- [ ] T032 [US2] 在 `internal/asset/query.go` 与 `internal/httpapi/handlers_assets.go` 支持 `model_id` 查询参数（语义同 `status`/`owner_id`：给了收窄，不给不收窄）
- [ ] T033 [P] [US2] 在 `internal/httpapi/` 加集成测试：`GET /assets?model_id=…` 只返回该型号的资产
- [ ] T034 [US2] 在 `web/src/routes/Assets.tsx` 加型号筛选 `Select`，状态经 `useSearchParams` 进地址栏（不进 localStorage），并随类别筛选变化重置
- [ ] T035 [US2] 在 `web/src/routes/Assets.tsx` 的显示列下拉里，对 `model_ids` 非空的字段做解锁判定：当前型号筛选命中其绑定才可勾，否则 `disabled` 并带 `title` 说明（禁用而非隐藏）
- [ ] T036 [US2] 确认 `web/src/features/assets/useColumns.ts` 的「与 `available` 求交」在型号筛选变化时自动收回不再适用的列（预期零改动，若不成立则在此修正）
- [ ] T037 [US2] 在 `web/src/i18n/zh.ts` 与 `en.ts` 加文案：型号筛选器的「全部型号」、显示列中禁用项的 `title` 说明
- [ ] T038 [P] [US2] 在 `web/tests/assets.test.tsx` 加 DOM 测试：选择型号筛选后请求带上 `model_id`，且值写进地址栏
- [ ] T039 [P] [US2] 在 `web/tests/assets.test.tsx` 加 DOM 测试：未选型号时该字段勾选框禁用；选中匹配型号后可勾；勾上后表格出现该列
- [ ] T040 [P] [US2] 在 `web/tests/assets.test.tsx` 加 DOM 测试：清空型号筛选后该列自动收回，不留空列

**验收点**：跑通 quickstart 第 7 步。

---

## Phase 5 · User Story 3（P2）：弹窗顶部的只读属性卡

**目标**：点开一台设备，最顶部直接看到它全部字段的当前值，无需展开任何折叠面板。

**独立验收**：点开任意一台已有设备，验证顶部卡片列出了它的字段值。

- [ ] T041 [US3] 在 `web/src/routes/AssetDetail.tsx` 于 `DialogHeader` 之下、流转卡之上加一张只读 `Card`：`CardHeader/CardTitle` + `CardContent` 内 `<dl>` 列出字段名与值，空值走 `t.common.none`
- [ ] T042 [US3] 该卡只取类别/型号绑定的动态字段，排除六个内建字段（类别、状态、持有方、负责人、备注、编号）
- [ ] T043 [US3] 无任何动态字段时该卡用 `Empty` 表达空态，不渲染一张空卡
- [ ] T044 [US3] 在 `web/src/i18n/zh.ts` 与 `en.ts` 加文案：属性卡标题、空态说明
- [ ] T045 [P] [US3] 在 `web/tests/assetDetail.test.tsx` 加 DOM 测试：顶部卡片展示字段名与值，且在文档顺序上先于流转卡
- [ ] T046 [P] [US3] 在 `web/tests/assetDetail.test.tsx` 加 DOM 测试：卡内不含状态/持有方/负责人/备注，且下方「编辑设备属性」折叠面板照常存在

**验收点**：跑通 quickstart 第 8 步。

---

## Phase 6 · User Story 4（P3）：导入导出带上型号专属字段

**目标**：批量路径与交互路径口径一致。

**独立验收**：下载模板确认含型号绑定字段列；导出同一类别确认列一致。

- [ ] T047 [US4] 确认 `internal/importer/template.go` 与 `export.go` 的列集随 `EffectiveFields` 自动含型号模式字段（预期零改动，跑测试确认）
- [ ] T048 [US4] 在 `internal/importer/resolve.go` 加错配判定：某行 `model` 列的型号未绑某型号模式字段、而该列有值时，把该行标为错误 `field_not_for_model`，不写入
- [ ] T049 [US4] 在 `internal/i18n/keys.go` 与 `catalog.go` 加 `field_not_for_model` 的中英双语逐行提示
- [ ] T050 [P] [US4] 在 `internal/importer/` 或 `internal/httpapi/` 加集成测试：导入模板含型号模式字段列
- [ ] T051 [P] [US4] 在 `internal/httpapi/` 加集成测试：错配行在预览阶段被标错且提交后写入量为 0
- [ ] T052 [P] [US4] 在 `internal/httpapi/export_test.go` 加集成测试：本次结果无该型号设备时导出仍含该列（列由 schema 决定）
- [ ] T053 [P] [US4] 在 `internal/httpapi/export_test.go` 加集成测试：同类别不同型号勾选导出得到一个 CSV，不分包

**验收点**：跑通 quickstart 第 9–10 步。

---

## Phase 7 · Polish 与横切事项

- [ ] T054 同步合约：把新端点、新字段、新参数、三个新 error code 写进 `specs/001-asset-ledger-demo/contracts/openapi.yaml`，并 `cp` 到 `internal/httpapi/docs/openapi.yaml`（有测试盯两者一致）
- [ ] T055 更新 `deploy/smoke.sh`：加一条「型号绑定端点在没有对应数据时的行为」检查（章程要求改了端点就要改冒烟脚本）
- [ ] T056 在 `CLAUDE.md` 加一条硬规则：字段绑定两种模式互斥、唯一性范围各自计算、`display_key` 只认类别模式字段、换型号会归档
- [ ] T057 更新 `docs/zenith-printer.md` 与 `.en.md`：`GET /api/rows` 的列会因型号绑定字段变宽，不匹配行留空（两份一起改）
- [ ] T058 i18n 完整性核对：`TestCatalogsCoverTheSameKeys` 通过，`web` 端 `en.ts` 受 `typeof zh` 约束不缺键，新增文案无一遗漏
- [ ] T059 跑完整门禁：`gofmt -l` 空、`go vet`、`golangci-lint run` 零告警、`go test ./...` 全过、`npx tsc --noEmit`、`npm run lint`、`npx vitest run` 全过、`npm run build` 通过
- [ ] T060 按 `quickstart.md` 起本地服务实机走一遍 11 步（含第 11 步的既有行为回归）

---

## 依赖关系

```
Phase 1 (T001–T002)
   ↓
Phase 2 (T003–T009)  ← 阻塞全部故事
   ↓
   ├─ Phase 3 / US1 (T010–T031)  ← MVP，其余故事都依赖它产出的型号模式字段
   │      ↓
   │      ├─ Phase 4 / US2 (T032–T040)   独立于 US3、US4
   │      ├─ Phase 5 / US3 (T041–T046)   独立于 US2、US4
   │      └─ Phase 6 / US4 (T047–T053)   独立于 US2、US3
   ↓
Phase 7 (T054–T060)
```

US2、US3、US4 三者之间**没有依赖**，US1 完成后可并行推进。

## 并行机会

- **Phase 2**：T008、T009 两条测试可并行。
- **Phase 3**：T020–T024 五条服务端集成测试可并行；T029–T031 三条 DOM 测试可并行；
  但服务端实现（T010–T019）内部按顺序，因为都改 `internal/schema` 与 `internal/asset` 的同一批文件。
- **Phase 4/5/6**：三个故事整体可并行，各自内部的 `[P]` 测试也可并行。
- **Phase 7**：T054–T058 可并行，T059、T060 必须最后串行执行。

## 实施策略

**MVP = Phase 1 + 2 + 3（US1）**。做完这三段，「给特定型号配一个专属字段」这件事
端到端可用：能建、能绑、录入表单会按型号显示、唯一性与归档都对。
US2/US3/US4 是在这个基础上的三个独立增量，任何一个不做也不影响其余部分可用。

**提交切分**（对应 plan.md 的实现顺序）：
1. Phase 1+2+3 的服务端部分 → 一个提交
2. Phase 3 的前端部分 → 一个提交
3. Phase 4 / 5 / 6 各一个提交
4. Phase 7 → 一个提交

## 格式自检

全部 60 条任务均为 `- [ ] T0NN [P?] [US?] 描述 + 文件路径` 格式：
Setup（T001–T002）与 Foundational（T003–T009）无故事标签，
US1–US4 阶段任务全部带 `[US1]`–`[US4]`，Polish（T054–T060）无故事标签。
