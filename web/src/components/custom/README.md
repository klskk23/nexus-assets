# 自定义组件目录

**本目录下的任何组件都必须事先获得开发者的明确批准。**

依据：项目章程原则 III「用户体验一致性」——

> 所有 UI 组件必须来自 shadcn/ui。若所需组件在 shadcn/ui 中不存在，必须先与开发者确认
> 并获得明确批准，才可实现自定义组件。未经确认引入的自定义组件在 code review 中直接
> 拒绝，**不接受事后补批**。

## 加组件前先确认这三件事

1. shadcn/ui 里真的没有对应组件吗？先查 https://ui.shadcn.com/docs/components
2. 能不能用现有组件**组合**出来？例如类别树就是用 `Collapsible` 递归组合实现的
   （见 `web/src/features/tree/CollapsibleTree.tsx`），不算自定义组件
3. 如果确实需要，**先问开发者**，拿到批准后再动手

## 批准后的要求

组件文件顶部必须有注释记录批准依据：

```tsx
/**
 * Approved by developer on YYYY-MM-DD.
 * Reason: <why shadcn/ui cannot cover this>
 * Source: <where the approval was given>
 */
```

## 当前状态

**空。** 本项目目前不存在任何自定义组件。
