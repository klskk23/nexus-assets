# Specification Quality Checklist: 持有方主从化，四个主从页拉齐

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

三轮修订，逐条记下改了什么，因为其中两条是真的改了规格而不是改了措辞。

**第一轮 —— 实现细节渗进来了。** 初稿的需求里直接写了端点路径
（`GET /holders/counts`）、组件名（`TreePager` / `rootPaging` / `useFoldable`）、
以及折叠阈值 12。三样都是「怎么做」：**规格该说的是「一次批量查询」而不是它叫什么路径**，
是「超过既定阈值就折起」而不是那个数字是几。阈值定成 12 的理由（行高 38px、
左栏可见约 18 行）属于调研，不属于规格。已全部改写；具体端点与组件留给 plan。

**第二轮 —— SC 里有两条不可验证。** 原来的 SC-001 写「层级更清楚」，
SC-006 写「与另外三页一致」——「更清楚」「一致」都不是能判定的。
改成「不点开任何东西、不横向滚动即可读出三层从属」与「在操作上无法区分」。

**第三轮 —— 一条被我漏掉的验收。** FR-023 说了无权限禁用而非隐藏，
但没有任何 SC 覆盖「不点就能知道自己不能做」这件事，而这正是本轮改
「设为默认库存点」入口的**唯一理由**。补了 SC-004。

**故意留在规格里的一条实现气味**：FR-035 与 SC-005 提到了
`MasterDetail` / `useMasterSelection` 两个具体名字。它们是 025 立下的、
本轮必须验证的约束（「第四个调用方进来时不必改骨架」），
**验收对象就是那两个文件本身**，换成抽象说法会让这条验收无法执行。
