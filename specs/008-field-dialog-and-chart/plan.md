# Implementation Plan: 信息项对话框与类别分布图表

**Branch**: `001-asset-ledger-demo` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

## Summary

两处呈现调整，都不动数据。

信息项的编辑器是 007 遗漏的一处：那一轮把五个元数据页统一成「点击行编辑」，
但信息项的编辑器本身仍是一块内联展开的 `Card`，点击一行会把整张表推下去。改成对话框。

类别分布从进度条列表换成条形图。原来那处代码的注释写着
「一根条和一个数字说清了图表要说的事，也把图表库挡在了 bundle 外」——
后半句仍然成立，所以图表**按需加载**：拆开之后概览页自身的 chunk 从 358KB 回到 4.4KB。

## Technical Context

**Language/Version**: 同 007

**Primary Dependencies**: 新增 `recharts`（随 shadcn `chart` 组件由 CLI 引入）。
**它不进入口 chunk，也不进概览页的 chunk**

**Storage**: 无迁移

**Testing**: 图表的 DOM 测试需要让 jsdom 里的响应式容器测得到尺寸（research.md D3）

**Constraints**: 入口 chunk 体积不得因本轮增加

**Scale/Scope**: 3 个用户故事、14 条功能需求、无端点变化。前端约 8 个文件

## Constitution Check

| # | 原则 | 本特性的符合情况 |
|---|------|------------------|
| I | 代码质量 | 图表独立成 `features/overview/CategoryChart.tsx`，概览页只传数据与一个回调 —— 它也因此成为可 `lazy` 的边界。**新增依赖**：`recharts`，经 shadcn CLI 引入 |
| II | 测试标准 | **DOM 测试**：信息项编辑器的七条沿用（删除新增键名确认）；图表新增两条 —— 柱体带名称与数量、点击进入筛选。测试环境的 `ResizeObserver` 桩改为回报真实尺寸，否则图表根本不渲染，断言会因无关原因通过 |
| III | 用户体验一致性 | `chart` 由 shadcn CLI 添加，**自定义组件仍为 0**。信息项编辑器改用 `Dialog`，与型号、状态、持有方的编辑器同形；删除加上键名确认，与其余不可撤销操作一致 |
| IV | 性能要求 | **入口 chunk 不变**（495KB / gzip 161KB）。图表拆为独立 chunk 后，概览页 chunk 从 358KB 降到 4.4KB —— 状态卡片与最近流转不再等图表库下载完 |
| V | 语言规范 | 无新增文案。图表的 tooltip 复用 `tOverview.unit` |

**Gate 结论**：五项原则全部通过。

## Project Structure

```text
web/src/
├── components/ui/chart.tsx                # shadcn CLI 添加
├── features/overview/CategoryChart.tsx    # 新增，lazy 的边界
├── features/fields/FieldEditor.tsx        # Card → Dialog
├── routes/Overview.tsx                    # Suspense + Skeleton
├── index.css                              # --chart-1，两套主题
└── test/setup.ts                          # ResizeObserver 报真实尺寸
```

**Structure Decision**: 图表放 `features/overview/` 而不是 `components/`：
它知道类别分布的形状与点击后去哪，是这一页的组件，不是通用图表。

## Complexity Tracking

**当前无章程违反项。**

### 边界登记

| 事项 | 性质 | 处置 |
|------|------|------|
| 引入 recharts（gzip 107KB） | 依赖边界 | 用户明确要求 chart 组件。代价用 `lazy` 隔离：入口 chunk 与概览 chunk 都不含它。若日后没有第二处图表，这 107KB 服务于一张图，届时值得重新权衡 |
| 状态分布保持卡片 | 一致性边界 | 那五张卡片同时是筛选入口，换成图表会把一个每天在用的动作换成一张更好看的图。用户说的也是「类别分布」 |
| `ResizeObserver` 桩改为回报尺寸 | 测试环境边界 | 原来的空桩让任何依赖测量的组件静默失效。改动影响所有测试，但只在有组件真的测量时才有区别 —— 全套 195 条通过 |
| 关闭入场动画 | 呈现边界 | 数值标签在动画完成前不绘制，而数字是来这里要看的东西。见 research.md D2 |
| 007 声称删掉了操作按钮列，实际漏了一处 | 修正 | 持有方页的「设为默认库存点」按钮还在，与行点击冲突。替换脚本没匹配上（文件被格式化过），而当轮总结照着意图写了。本轮补上，并把该动作收进编辑对话框。见 research.md D6 |
