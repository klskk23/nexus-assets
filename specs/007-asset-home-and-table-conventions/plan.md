# Implementation Plan: 资产归属与表格规范

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

## Summary

三件事，第一件动数据模型，后两件动界面约定。

**归属**：归还的目的地从系统的属性变成设备的属性。一个仓库时全局默认是对的答案，
多个仓库时它是一个具体的错误答案 —— 把上海的设备还到北京货架上会被写进账本。

**表格规范**：元数据页的操作列换成行点击 + 右键菜单，型号补上它从 001 起就缺的
编辑与删除。

**收纳**：语言、主题、退出登录收进一个下拉；资产选中栏去掉 48px 的无用留白。

## Technical Context

**Language/Version**: 同 006

**Primary Dependencies**: 新增两个 shadcn 组件（`context-menu`、`dropdown-menu`），
经 CLI 添加，**无新增第三方依赖**

**Storage**: 迁移 `008_asset_home.sql`：`assets` 加三列，全部可空。无表重建，Down 可逆

**Testing**: 归属的逐台解析在 `internal/transfer` 与端点两层覆盖；
型号生命周期五条单元测试 + 端点；右键菜单新增 `web/src/test/menu.ts` 助手，
七个页面的 DOM 测试相应改写

**Constraints**: 右键菜单在触发时关闭，确认框必须渲染在菜单之外（research.md D4）

**Scale/Scope**: 5 个用户故事、17 条功能需求、1 次迁移、新增 3 个端点。
后端约 10 个文件、前端约 14 个文件

## Constitution Check

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | **分层**：归属的解析在 `internal/transfer` 内，HTTP 层只做三态解包。型号的编辑/删除与信息项、状态、持有方走同一套仓储形态（`Update*Input` 全指针、`*Usage`、`Delete*` 返回阻挡数）。**新增依赖**：零 |
| II | 测试标准 | **核心管线**：逐台归还、无归属兜底、都没有时报错三条；型号的替换语义、部分更新、重名、被使用拒绝、级联五条。**端点集成测试**：归属往返、型号三端点。**DOM 测试**：右键菜单助手 + 七个页面改写，新增设置菜单与归还目标共 5 条。**覆盖率**：核心五包维持 ≥ 80% |
| III | 用户体验一致性 | 两个新组件均由 shadcn CLI 添加，**自定义组件仍为 0**。行点击 + 右键成为元数据页的统一约定；不适用的菜单项禁用而非隐藏，与 005「部门」选项的处置一致。类别页**有意不套用**（research.md D5） |
| IV | 性能要求 | 归属解析多读三列，在既有的单条 SELECT 里。前端 bundle 因两个新组件从 gzip 132KB 增至 161KB，门禁是 500KB。未压缩 495KB 已逼近 Vite 的默认告警线，下次加组件前需要考虑分包 |
| V | 语言规范 | 新增文案全部进两份目录；`internal/i18n` 新增三条键。`t.nav.settings` 在实现中被删除 —— 它是给 `aria-label` 写的，而那个 `aria-label` 本身是错的（FR-016） |

**Gate 结论**：五项原则全部通过。

## Project Structure

```text
migrations/008_asset_home.sql          # assets 加 home_* 三列

internal/
├── model/model.go                     # Asset.HomeHolder / HomeOwner
├── asset/{persist,pipeline}.go        # 扫描、写入、三态
├── transfer/transfer.go               # 归还的逐台解析
├── schema/model_store.go              # UpdateModel / ModelUsage / DeleteModel
└── httpapi/
    ├── handlers_assets.go             # 归属的三态解包 + decorate 解析名字
    ├── handlers_metadata.go           # 型号的 patch / delete / usage
    └── server.go                      # 3 条新路由

web/src/
├── components/ui/{context-menu,dropdown-menu}.tsx   # shadcn CLI 添加
├── features/metadata/CrudPage.tsx     # onRowClick + rowActions + 受控确认
├── features/common/ConfirmDialog.tsx  # 受控模式
├── features/assets/ActionBar.tsx      # 去掉 Card 的 py-6/gap-6
├── features/transfers/TransferDialog.tsx  # 归还可选目标
├── routes/AssetDetail.tsx             # 归属的编辑
├── routes/{Fields,Models,Holders,Statuses,Users}.tsx  # 行点击 + 右键
├── routes/AppShell.tsx                # 设置下拉
└── test/menu.ts                       # 右键菜单的测试助手
```

**Structure Decision**: `rowActions` 与 `onRowClick` 进 `CrudPage` 而不是每页各写一遍 ——
「不适用则禁用」「破坏性动作要确认」这两条约定，只有集中在一处才可能一致。

## Complexity Tracking

**当前无章程违反项。**

### 边界登记

| 事项 | 性质 | 处置 |
|------|------|------|
| 类别页不套用表格规范 | 一致性边界 | 它是树不是列表，「点击行」已经有含义（选中并展开）。规范是为了让相似的东西相似，不是让所有东西一样。见 research.md D5 |
| 录入表单不问归属 | 范围边界 | 创建时归属 = 录入时的持有方，是一个结论已定的问题；而录入对话框刚因为太长被抱怨过。改归属在详情页 |
| 账号没有删除 | 一致性边界 | `actor_id` 从每条审计记录指向它。菜单里只有停用，而不是一个永远被拒绝的删除 |
| bundle 未压缩 495KB | 性能边界 | 门禁是 gzip 后 500KB，当前 161KB，有余量。但未压缩已逼近 Vite 的默认告警线；再加组件前应该按路由分包 |
| 归还的批量目标只有一个 | 语义边界 | 「各自的默认归属」是唯一能逐台不同的选项；选了具体持有方就整批去那里。一次操作有一个目标才是可预期的 |
