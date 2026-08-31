# Specification Quality Checklist: 持有方层级与保管责任

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

**第 1 轮校验（2026-08-31）—— 4 项未通过**

1. **规格照抄了报告里的因果，而那个因果是错的。**
   初稿写成「因为可能有多仓库，所以去掉在库的位置限制」。实测**位置到位置一直是通的**，
   被挡住的是公司与部门。照这条写下去会去改一个没有坏的地方。
   已在 spec 顶部加「一处需要更正的前提」，并在 research.md D1 给出实测表格。
   **这不是文字问题**：需求的验收条件因此从「能换仓库」变成了「能交给组织」。

2. **「去掉这个限制」没有界定是删除能力还是关闭默认。**
   两种读法代价不同：删列不可逆，且会让一个真的需要它的自定义状态（「在维修站」）
   永远没法表达。已在 FR-001/FR-002 写明取「关闭且可编辑」，
   并要求它在状态管理页可见 —— 迁移里静默翻一个标志位、界面上毫无痕迹是更糟的做法。

3. **与 004 FR-012 的抵触没有被承认。**
   004 明写「内置状态的三个行为开关不可改」，本轮要改其中一个。
   初稿只写新行为，读者会以为是漏改或前后矛盾。已在取代关系表里点名，
   并在 plan.md 的边界登记中附上核对过程（哪个开关有第二个读者，哪个没有）。

4. **负责人默认值在归还场景下的语义没写。**
   「默认当前账号」在签出时合理；归还时把责任人换成操作者可能不是本意。
   已补 FR-008 与 US2 场景 6：必须提供「不变」，且它的实现是**不发送字段**
   而不是发送空值。

**第 2 轮校验（2026-08-31）—— 16/16 通过**

**已知可接受项（不视为缺陷）**

- FR-004（拒绝挂在 `to_holder_id`）提到了字段名，像实现细节。保留：
  用户报告的正是「文案和实际行为不符合」，而错误挂在哪个字段上就是这个现象本身。
- FR-015（迁移不回填）是一条要求系统**不做**某事的需求。保留并写明理由，
  否则下一个读者会当它是遗漏 —— 与 003 FR-009 同类。
- US4 场景 8 描述升级前的存量数据。这是可验收的行为，不是实现说明。

**结论**：16/16 项通过，可进入 `/speckit-plan`。

**规模**：5 个按优先级排序的用户故事（互不阻塞）；17 条功能需求；
5 条成功标准；31 个任务；**0 个新增端点**。
