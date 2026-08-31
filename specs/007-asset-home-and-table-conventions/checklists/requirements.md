# Specification Quality Checklist: 资产归属与表格规范

**Created**: 2026-08-31 | **Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
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

1. **「设备自身要绑定默认持有方」没说在哪里设、能不能清空。**
   初稿只写了「录入时自动设」。那样归属就是一个建了就改不掉的字段，
   而设备永久换地方是常事。已补 FR-006 与 US1 场景 5–6：详情页可改可清空，
   清空后回退到全局默认库存点。

2. **批量归还的语义没有界定。**
   「各自回各自的家」和「整批去一个地方」在一次操作里不能同时成立。
   已在 Assumptions 与 US2 场景 2 写明：不选目标才逐台解析，
   选了具体持有方就整批去那里 —— 一次操作有一个目标才是可预期的。

3. **「表格风格统一和资产一样」被当成了一句形容词。**
   资产表格有分页、列选择、勾选、导出。全套照搬到只有五行的信息项页是把它变差。
   已把「统一」收窄为可验收的三条（FR-007~FR-009）：行点击、右键菜单、去掉操作列，
   并在 Assumptions 里点明类别页**有意不套用** —— 它是树不是列表。

4. **「根据不同的特性增加不同的按钮」没有对应的可验收行为。**
   不同页的菜单项不同是必然的，但**不适用的项该消失还是该禁用**才是要定的。
   已补 FR-010：禁用而非隐藏，与 005「部门」选项的处置一致，
   并在 US3 场景 5 举出三个具体的例子。

**第 2 轮校验（2026-08-31）—— 16/16 通过**

**已知可接受项**

- FR-016（不用 `aria-label` 覆盖用户名）读起来像实现细节。保留：
  它是一条可验收的可访问性要求，而且它是在实现中真的犯过一次的错误。
- US1 场景 3–4 描述升级前的存量数据。这是可验收的行为，不是实现说明。

**规模**：5 个用户故事；17 条功能需求；4 条成功标准；36 个任务；新增 3 个端点。
