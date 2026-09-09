# Specification Quality Checklist: 审计分栏、流转可查、筛选可搜

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-09
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

**这一版比 022 更彻底地避开了实现**：没有端点路径、没有权限键名、没有组件名、
没有依赖名、没有文件路径。20 条裁定里带具体名字的（`transfer.audit`、`GET /transfers`、
`cmdk`、`MetadataTabs`）全部下沉到 plan —— 规格只说「必须存在一种方式列出全系统的流转」
和「新增权限必须在全部四个登记处同时出现」。

两处刻意的措辞值得记下来：

1. **FR-007「全部四个登记处」不点名是哪四处。** 点名了就成了实现细节，
   但这条必须留在规格里 —— 它是这个代码库里一个已知的、会静默失败的坑
   （漏掉其中一处，界面会认为无人拥有该权限，而没有任何编译错误或测试会报）。
   规格说「必须四处同时出现」，plan 负责说是哪四处。

2. **SC-001 把测试写进了成功标准**：「由一条在迁移被还原时会失败的测试保证」。
   通常这算实现细节。这里保留，因为 FR-002 是本轮唯一一条**做错会收回别人已有能力**
   的需求，而一次性迁移的正确性无法靠事后观察发现 —— 等有人报「我看不到审计了」
   已经晚了。**验收必须包含它自己的证据。**

**没有 [NEEDS CLARIFICATION]**：20 条裁定在 `/grill-me` 中逐条决断，
包括几处我提出反对的（厂商权限只转一半、页签必须是两条路由、不在 Select 里塞输入框）。
