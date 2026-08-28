# Specification Quality Checklist: 编号模型重构与流转补全

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-28
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

**这份规格是在实现完成之后补写的。** 说清楚这一点比让它看起来像事前产物更重要 ——
下一个读它的人需要知道，它的验收标准是从已经跑通的行为反推出来的，
而不是先立标准再去实现。因此本清单校验的是**重建的忠实度**，不是把关。

需求本身在实现前是经过澄清的：五个分支通过 `/grill-me` 逐条问答收敛，
决策落在 `docs/design-baseline-v2.md`（25–40）。缺的是把它们表述成用户故事与验收场景
这一层，本规格补的就是这一层。

**校验（2026-08-28）—— 16/16 通过，另记三处修正**

补写过程中发现三处与实现不一致或表述不清，已在规格中修正：

| 问题 | 处置 |
|------|------|
| 初稿把「表达式键的依赖必须必填」写成实现细节 | 改写为 FR-016 与 US3 场景 3 —— 它是一条用户能观察到的拒绝行为，不是内部机制 |
| 初稿沿用 001 的「编号不可重用」 | 与实现不符。实现允许归档值被另一台设备重新占用（US2 场景 8），并在 Assumptions 中说明推翻理由 |
| Edge Cases 漏了「解绑端点尚未开放」 | 补上。`Unbind` 的守卫已实现，但 HTTP 层没有对应端点，界面上只能绑不能解 —— 这是 001 的遗留状态，本特性没有改变它，不写清楚会让读者以为 FR-018 的解绑拦截可以从界面上触发 |

**若这份清单在实现之前跑过，本可以提前发现的一项**

- **FR-020（模板改写复检）在初次设计中不存在**。它是实现 US3 时写测试才想到的 ——
  绑定门禁只在绑定那一刻跑，事后改模板就绕过去了。
  逐条推敲「这条护栏在哪些时刻会失效」，本可以在设计阶段就问出来，而不是靠运气。

**已知可接受项（不视为缺陷）**

- spec.md 顶部的「与 feature 001 的关系」表格引用了 001 的 FR 编号。
  那是依赖声明与取代关系说明，不属于实现细节泄漏。
- FR-031「错误信息中不得出现英文标识文本」提到了「用于程序判定」这一用途。
  该措辞描述的是用户可观察的结果（界面上不该出现什么），不是实现方式。
- Assumptions 中提到「写连接池为 1 从此是性能选择」。这是一条对既有约束**理由**的更新，
  写在这里是为了让下一个人不至于把它当成正确性前提去维护，属于必要的范围声明。

**结论**：16/16 项通过。

**规模**：5 个按优先级排序的用户故事；31 条功能需求；10 条成功标准；100 个任务。
