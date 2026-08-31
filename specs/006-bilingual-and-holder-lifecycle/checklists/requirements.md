# Specification Quality Checklist: 中英双语与持有方生命周期

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

**澄清过程中问了用户两个问题，都得到了明确回答**：双语是否覆盖服务端错误消息
（答：覆盖），持有方的删除与停用是什么关系（答：删除取代停用）。
第一个问题的两种答案工作量差一个数量级，第二个决定了要不要动 003 的一条明确决策 ——
两个都不该由实现者替用户决定。

**第 1 轮校验（2026-08-31）—— 4 项未通过**

1. **「支持中英双语」没有界定边界。**
   初稿只说界面双语，没说服务端返回的拒绝理由算不算。半英文半中文比全中文更糟 ——
   它看起来像功能已经做好了。已补 FR-004 与 US1 场景 3，并把「CSV 表头翻译、
   键名行不翻译」写成可验收的一条（场景 4）—— 那一行是给机器读的。

2. **与章程原则 V 的冲突没有被承认。**
   原则 V 写的是「用户可见文案是中文」。双语系统里这句话无法成立。
   初稿绕过了它。已在 FR-001 明确修订该原则的表述，并在 plan.md 的原则 V 一栏
   写清收窄成了什么、什么一字未改（标识符、日志、错误码、CSV 键名行）。

3. **「和之前的设计对齐」被当成了一句形容词。**
   003 曾**明确决定**持有方不跟着改为可删除，理由是流转历史引用它。
   直接改掉而不解释，读者会以为是漏读了 003。已在取代关系表里点名，
   并在 research.md D7 写清为什么现在可以了：004 给状态确立的
   「当前数据拒绝、历史记录提示」是 003 当时还没有的规则。

4. **切换语言的副作用没写。**
   实现会重挂整棵树，半填的对话框会被清空。这是用户能感知的行为，
   不写就成了一个 bug 报告。已写进 Assumptions，并在 US2 场景 4 里
   把「缓存被丢弃」变成可验收的一条。

**第 2 轮校验（2026-08-31）—— 16/16 通过**

**已知可接受项（不视为缺陷）**

- FR-005（领域层不自行格式化）读起来像架构约束。保留：它是 FR-004 能成立的前提，
  也是唯一能防止「新加的一条消息忘了翻译」的结构性保证。
- FR-007（缺失的键渲染为键本身）描述了一个开发期才看得到的行为。保留：
  它是一条**故意选择的**失败方式，写下来才不会被下一个人「修好」成空字符串。
- Assumptions 里承认「不做复数规则」。这是一处已知的语言质量折衷，写明比藏着好。

**结论**：16/16 项通过。

**规模**：4 个用户故事（US1 与 US2 必须成对交付）；15 条功能需求；
5 条成功标准；39 个任务；新增 2 个端点、1 个后端包。
