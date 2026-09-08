# Specification Quality Checklist: 资产详情整页与对话框改版

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-08
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

**本轮与 020/021 不同：规格里没有一个 CSS 类名、没有一个像素值、没有一个文件路径。**

那两轮做不到，是因为它们的需求本身就是一条 CSS 事实（「内容列没有宽度规则」无法在
不指认那条规则的情况下陈述）。本轮的需求是行为与关系：详情是页不是框、返回去哪、
历史在不在同一页、确认框的语气、对比度够不够。这些都能在不提实现的前提下写清并验收。

具体处理：

- **颜色**写成「深黏土色」+ 对比度阈值，不写十六进制。稿子给的具体值属于 plan。
- **圆角**写成「必须大于卡片圆角」，不写 32px。**这样写更强** —— 它约束的是层级关系，
  卡片圆角若将来变了，这条依然成立。
- **20 处调用点零改动**写成 FR-015 与 SC-004。这看似实现细节，实则是用户价值的直接表达：
  它是「改一处、二十处都对」与「改二十处、以后每加一处都要记得」的分界。
- **FR-020 的例外**（深色条不用破坏性色）在规格里保留了完整理由。这是本轮最容易被
  后来者当成疏漏的一条 —— 一个破坏性动作没有用破坏性颜色，看起来就像忘了改。
  规格不写明，代码注释就成了唯一的辩护，而注释比规格更容易在重构中丢失。

**一处放宽**：FR-016 说明了为什么不做眉标签，其中提到「仅含拉丁子集的展示字体」。
这接近实现细节，但它是**否决一个设计决定的理由**，删掉就只剩「不做」而没有依据，
下一轮会有人再提一次。留着。
