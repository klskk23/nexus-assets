# 任务：字段页与型号页主从化

**规格**：[spec.md](./spec.md) ｜ **计划**：[plan.md](./plan.md) ｜ **调研**：[research.md](./research.md)

## Phase 1：服务端计数

- [X] T001 `internal/asset`：`CountsByModel`，口径与 `subtreeCounts` 相同（排除 `counts_as_available = 0`）
- [X] T002 测试：一台已报废的设备不计入；没有设备的型号返回 0 而不是缺键
- [X] T003 **一致性测试**：同一份数据下，型号计数与类别计数对同一台设备的取舍相同 —— 读两条路径互相比较
- [~] T004 **撤销**：`GET /fields` 已经返回 category_ids / model_ids / vendor_ids，绑定数是三个数组之和。写完才发现端点是多余的，删掉了 —— 服务端本来就要问三张表才能填那三个数组，第二条路径只是多一个能和第一条不一致的东西
- [~] T005 随 T004 撤销。写这条测试时学到一条领域规则：**一个字段要么绑类别、要么绑设备，不能两边都绑** —— fixture 造了个两边都绑的字段，store 当场拒绝
- [~] T006 随 T004 撤销
- [X] T007 `GET /models/counts` 与 `GET /fields/binding-counts`，**不加 `need(...)`**
- [X] T008 [P] 两个端点加进 `permissions_test.go` 既有的「读默认全开放」清单
- [X] T009 [P] 两份 `openapi.yaml`（逐字节一致，有测试比对）
- [X] T010 [P] `deploy/smoke.sh`
- [X] T011 `go test ./...`

## Phase 2：共用件

- [X] T012 `features/common/TreePager.tsx`：上一页/下一页 + 第 n/N。**不套 `Pager`**
- [X] T013 `features/common/useFoldable.ts`：子项 > 12 默认折起，手动覆盖优先，不进地址
- [X] T014 测试：12 个子项不折、13 个折；手动展开后不被默认规则重新折起
- [X] T015 测试：**全树很长但每个节点子项都少 → 一个都不折**（判据是节点不是总数）

## Phase 3：字段页

- [X] T016 `features/fields/FieldTree.tsx`：组当父节点 + 不可选的「未分组」标题
- [X] T017 属于多个组的字段**每组下各出现一次**；选中时**每一处都高亮**
- [X] T018 搜索平展时**同一字段只出现一次**
- [X] T019 字段行显示绑定数（0 也写）；组行显示成员数
- [X] T020 `features/fields/FieldDetail.tsx`：键/类型/唯一/必填/所属组 + 绑到哪些目标
- [X] T021 `features/fields/GroupDetail.tsx`：成员 + 绑到哪些目标
- [X] T022 左栏底部两个新建按钮，各按自己的权限禁用并说明
- [X] T023 测试：树上 2 次 / 搜索 1 次（SC-004 的两个数）
- [X] T024 测试：选中一处，两处都高亮
- [X] T025 测试：右栏两种形态各一条
- [X] T025a 四种「修改」都开**现有**的编辑对话框，右栏**不放删除**（FR-013/014）—— 与 024 同一条，容易在新页上顺手放一个
- [X] T025b 测试：右栏没有破坏性按钮；点「修改」出现的是现有对话框

## Phase 4：型号页

- [X] T026 `features/models/ModelTree.tsx`：厂商 → 型号 + 不可选的「无厂商」标题
- [X] T027 厂商行用现成的 `model_count`；型号行用 `CountsByModel`
- [X] T028 `features/models/ModelDetail.tsx`：厂商/类别/设备数/字段，标出**继承自厂商**的
- [X] T029 `features/models/VendorDetail.tsx`：型号数 + 绑给旗下型号的字段
- [X] T030 **逐控件权限**：改名看 `model.manage`，字段绑定看 `schema.manage`
- [X] T031 测试：只有 `model.manage` / 只有 `schema.manage` / 都没有，三种各一条

## Phase 5：路由与迁移

- [X] T032 `/fields/:id`、`/models/:id`（与不带 id 的同一组件）
- [X] T032a `/fields/:id` 是**一个 id 空间**：先在组里找、再在字段里找（FR-026）
- [X] T032b 未指定时默认树上**第一个可选项**，地址不改写（FR-027，与 024 一致；窄屏的树因此仍可达）
- [X] T033 传给 `useMasterSelection` 的是**全部 id 而非本页 id**
- [X] T034 测试：选中项不在当前页时右栏仍显示它
- [X] T035 `/fields/groups`、`/models/vendors` 重定向
- [X] T036 删除 `routes/FieldGroups.tsx`、`routes/Vendors.tsx` 与它们的路由
- [X] T037 `MetadataTabs` 搬进 `features/audit/` 并改名（只剩审计一个使用者）
- [X] T038 类别页接上分页与折叠（FR-023）

## Phase 6：骨架与文档

- [X] T039 **确认骨架零改动**（SC-003）。改了就在报告里说清楚改了什么、为什么
- [X] T040 骨架的「只有一个调用方」测试改成三个具名调用方
- [X] T041 [P] `docs/rules/web-tables.md`：树按根分页、按节点折叠的判据、重复与去重两条
- [X] T042 [P] i18n 两份；删掉不再引用的键
- [X] T043 服务端门禁：`gofmt`、`go vet`、`go test ./...`、`nexus verify`
- [X] T044 前端门禁：`npm run build`、`eslint`
- [X] T045 实机走查 + 截图
- [X] T046 一次提交，**不推送**
