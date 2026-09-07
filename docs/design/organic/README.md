# Organic 设计语言 —— 017 重构的规格参照

这些文件是 **017 轮前端重构的规格书**，取自 Claude Design 的 `Nexus`
设计系统项目（`9c195028-ee3d-4486-9882-c9671a26604a`）。

| 文件 | 是什么 |
|---|---|
| `organic-tokens.css` | Organic 的 token 表与组件类。**颜色、间距、圆角、阴影、字号以此为准**，不要照抄别处的十六进制值 |

**还在 Claude Design 里、需要时去取的**（体积大，没有落库）：

- `mockups/nexus-assets-organic-full.html` —— 11 个视图的完整原型，实现阶段的像素参照
- `mockups/app.js` —— 筛选、Shift 连选、审计渲染、标签预览、弹窗的行为规范
- `design_handoff_nexus_assets_organic/README.md` —— 交接文档

## 与本仓库的三处已知冲突

采纳这套语言时**以仓库的真实契约为准**，原型里的字段名、路由名是照 README 猜的：

1. **字体**：`organic-tokens.css` 顶部 `@import` 了 Google Fonts。本项目部署在内网、
   前端 embed 在静态二进制里，**必须改为自托管**（017 决策）。
2. **深色**：Organic 只有一套浅色。本项目原有深浅两套 + 账号级主题偏好，
   **017 决定深色下架**，`users.theme` 字段保留不动。
3. **组件类体系**：`.btn` / `.tag` / `.seg` / `.input` 这套是 Organic 的写法。
   本项目**保留 shadcn/ui + Radix 作为行为层**，只把它们的类名改成这里的形态 ——
   照抄这份 CSS 会丢掉焦点陷阱、键盘导航与 aria（017 决策）。
