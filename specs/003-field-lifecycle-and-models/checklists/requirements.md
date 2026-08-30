# Specification Quality Checklist: 信息项生命周期与型号归属

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-30
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

**与 002 不同，这份规格写在实现之前。** 它是访谈收敛之后、动手之前的产物，
因此本清单是真的在把关，不是回顾。

**第 1 轮校验（2026-08-30）—— 3 项未通过**

1. **US1 与 US2 被写成了两个可独立交付的故事，但它们不能拆开交付。**
   移除停用（US1）而不补上解绑（US2），会让系统在一段时间内**没有任何字段下线手段** ——
   比现状更糟。已在 tasks.md 的「MVP 范围」中显式写明两者必须成对交付，
   并在 US2 的 Why this priority 里说明「不做 US2，US1 就是净损失」。

2. **FR-009（持有方与账号不跟着改）看起来像一条「什么都不做」的需求。**
   一条要求系统保持现状的需求，如果不说明为什么，读者只会当它是遗漏。
   已补上三者约束来源的差异（信息项是纯配置 / 持有方被历史按 id 引用 /
   账号被外键引用因而永远删不掉），并在 research.md D3 展开。

3. **两项在访谈中未获答复的决定被当作已定写进了规格。**
   型号候选范围与导入解析方式，用户没有回答。初稿直接写成了需求。
   已改为在 Assumptions 中显式声明「按倾向实现，以便后续推翻」，
   并在 spec 顶部的排除清单里点明用户提出但本轮不做的章程条款。

**第 2 轮校验（2026-08-30）—— 16/16 通过**

**已知可接受项（不视为缺陷）**

- spec.md 顶部的取代关系表引用了 001/002 的 FR 编号。属依赖声明，不是实现细节泄漏。
- Edge Cases 里提到「一次全表扫描」。这是一条会被用户感知的性能特征
  （删除比其他操作慢），不是实现方式的泄漏。
- FR-021（测试模拟数据不得包含服务端不返回的字段）表面上是一条关于测试的需求，
  看似不该出现在功能规格里。保留它，因为**这一轮的起因之一就是测试全绿却与 API 脱节** ——
  它是一条可验收的质量要求，SC-009 给了它可度量的形式。

**结论**：16/16 项通过，可进入 `/speckit-plan`。

**规模**：5 个按优先级排序的用户故事（其中 US1 与 US2 必须成对交付）；
21 条功能需求；9 条成功标准；66 个任务。
