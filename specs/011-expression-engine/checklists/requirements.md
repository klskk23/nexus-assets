# Specification Quality Checklist: 表达式引擎

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

**没有 plan.md / research.md：调研先于规格完成，写在
[`docs/research-expr-engine.md`](../../docs/research-expr-engine.md) 里**，
含备选方案、原型实测数据与实施顺序。再写一遍只会有两份会分叉的同一份内容。

**校验（2026-08-31）—— 16/16 通过，2 项曾未通过**

1. **初稿把三条护栏写成了「安全加固」，放在收尾。**
   它们不是加固，是**换引擎的前提**：旧语法的贫乏白送了这三样，新语法拿走了它们。
   报告里给的顺序是「先建护栏，再接引擎」，规格却把它们排在最后。
   已把 US2、US3 提到与 US1 同为 P1，并在 FR-002 写明三条既有护栏继续建立在引用分析上。

2. **迁移只写了「自动转换」，没说转换错了怎么办。**
   编号是唯一索引，一条转换错的规则会给同一台设备算出不同的编号，
   而冲突要到下一次保存才暴露。已补 FR-007 与 US4 场景 3：
   无法精确转换的**保留原样并点名**，不猜。

**实现中发现、已修正的一处（不在原规格内）**

`internal/httpapi` 有 **7 处**用 `err.Error()` 直接取消息，绕过了语言渲染。
006 做双语时漏掉了它们，当时看不出来 —— 那些 error 恰好也是中文。
表达式引擎返回真正的可翻译消息后，英文请求收到中文，差别才显出来。已全部改走 `userText`。

**规模**：5 个用户故事；10 条功能需求；4 条成功标准；1 次迁移；无新增端点。
