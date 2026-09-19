repo: klskk23/nexus-assets
branch: main
path: web/src

## Last sync
date: 2026-09-19T06:05:00Z
### Updated in this project
- 补全持有方、账号、角色、审计（操作 / 流转两栏）四页，以及账号编辑、角色编辑、变更内容弹窗
- 全部 13 屏可从左侧导航到达

## Sync history
### 2026-09-19T05:52:00Z
- 以 Nocturne 深色系统重构前端：壳、登录、概览、资产列表、设备详情、类别、字段、型号、状态，以及设置 / 流转 / 状态编辑 / 编辑类别 / 录入设备弹窗

## Screen map
| Screen | Repo files |
| --- | --- |
| 壳 / 导航 | web/src/routes/AppShell.tsx, web/src/features/common/navIcons.ts |
| 登录 | web/src/routes/Login.tsx |
| 概览 | web/src/routes/Overview.tsx, web/src/features/overview/DistributionBar.tsx |
| 资产列表 | web/src/routes/Assets.tsx, web/src/features/common/ListToolbar.tsx, web/src/features/assets/ActionBar.tsx |
| 设备详情 | web/src/routes/AssetDetail.tsx, web/src/features/transfers/TransferDialog.tsx |
| 类别 | web/src/routes/Categories.tsx, web/src/features/categories/CategoryDetail.tsx, web/src/features/common/MasterDetail.tsx, web/src/features/common/RailRow.tsx |
| 字段 | web/src/routes/Fields.tsx, web/src/features/fields/FieldDetail.tsx |
| 型号 | web/src/routes/Models.tsx, web/src/features/models/ModelDetail.tsx |
| 状态 | web/src/routes/Statuses.tsx, web/src/features/statuses/StatusBadge.tsx |
| 持有方 | web/src/routes/Holders.tsx, web/src/features/holders/HolderDetail.tsx |
| 账号 | web/src/routes/Users.tsx, web/src/features/users/UserEditor.tsx |
| 角色 | web/src/routes/Roles.tsx, web/src/features/roles/RoleEditor.tsx, web/src/features/auth/usePermissions.ts |
| 审计 | web/src/routes/Audit.tsx, web/src/routes/TransferAudit.tsx, web/src/features/audit/AuditTabs.tsx |
| 设置弹窗 | web/src/features/settings/SettingsDialog.tsx |
| 文案 | web/src/i18n/zh.ts |
