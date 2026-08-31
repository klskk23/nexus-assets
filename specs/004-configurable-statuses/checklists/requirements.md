# Specification Quality Checklist: 可配置的状态

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-31
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**第 1 轮校验（2026-08-31）—— 3 项未通过**

1. **「允许自定义状态」被写成了一条纯增能需求，没有说明它对既有护栏的影响。**
   五个状态之间有一张 5×5 矩阵，编码了 001 起就存在的判定。初稿只说「新状态可自由转换」，
   没有回答「那 `lost → in_use` 还禁不禁」。已补上 FR-006 与 US3 场景 5，
   把「引入自定义状态没有放松任何既有护栏」变成一条可验收的事实，
   并在 research.md D1 展开三种备选与代价。

2. **颜色被写成「允许设置状态的颜色」，未界定是自由值还是受限集合。**
   用户原话是「允许设置颜色」，两种读法都成立，而它们的代价差别很大：
   自由十六进制在默认深色的应用里必然产生不可读的组合。
   已在 Assumptions 中显式声明取受限色板，并写明这不是可选项而是可读性保证。

3. **删除判定只写了「有资产使用则拒绝」，漏掉了流转历史。**
   一个用过一次的状态会在 `asset_transfers` 里留下键名。初稿的规则会让它永远删不掉。
   已拆成 FR-011 与 FR-013 两条，并在 US4 场景 4–5 给出可验收形式；
   不对称的理由在 research.md D5。

**第 2 轮校验（2026-08-31）—— 16/16 通过**

**已知可接受项（不视为缺陷）**

- FR-002（`assets.status` 不加外键）读起来像实现细节。保留它，因为它是一条
  **用户可感知**的约束：数据库层允许写入不存在的状态键，因此界面必须有回退显示
  （FR-017）。两条需要成对阅读。
- FR-010 直接给出五个默认颜色。这是用户明确授权的（「你可以为当前这几个状态设置
  你认为合理的默认 custom color」），理由随表列出，可被推翻。
- SC-005「状态标签在系统中只有一处定义」表面上是关于代码组织的。保留它，
  因为这一轮的起因之一就是它此前有两处（前端 i18n 与 CSV 导出器），
  而两处从未被发现不一致 —— 它是一条可验收的质量要求。

**结论**：16/16 项通过，可进入 `/speckit-plan`。

**规模**：4 个按优先级排序的用户故事（互不阻塞，可逐个停下）；
17 条功能需求；5 条成功标准；48 个任务。
