import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders } from "@/test/renderWithProviders"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { CollapsibleTree, buildTree } from "@/features/tree/CollapsibleTree"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { Timeline } from "@/features/transfers/Timeline"
import { StateBoundary } from "@/components/StateBoundary"
import { Button } from "@/components/ui/button"
import type { BoundField, FieldType } from "@/lib/types"

function field(key: string, type: FieldType, label: string): BoundField {
  return { id: key, key, label, type, options: {}, is_unique: false, required: false, sort: 0 }
}

/**
 * Constitution principle III: every interactive element must be reachable from
 * the keyboard and must show where the focus is.
 *
 * These check the shared building blocks the eleven routes are made of. A form
 * control without a label is unreachable for a screen reader and unlabelled in
 * a test, so the same assertion covers both concerns.
 */
describe("keyboard reachability and labelling", () => {
  it("labels every control the dynamic form renders", () => {
    const fields = [
      field("mac", "mac", "基准 MAC"),
      field("ports", "number", "端口数"),
      field("managed", "boolean", "纳管"),
      field("bought", "date", "采购日期"),
      field("note", "text", "备注"),
    ]
    renderWithProviders(<DynamicForm fields={fields} values={{}} onChange={vi.fn()} />)

    for (const f of fields) {
      const control = screen.getByLabelText(new RegExp(f.label))
      expect(control).toBeInTheDocument()
      // An element the keyboard cannot reach is not usable, however it looks.
      expect(control).not.toHaveAttribute("tabindex", "-1")
    }
  })

  it("moves focus through a form in reading order", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DynamicForm
        fields={[field("mac", "mac", "基准 MAC"), field("note", "text", "备注")]}
        values={{}}
        onChange={vi.fn()}
      />,
    )
    await user.tab()
    expect(screen.getByLabelText(/基准 MAC/)).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText(/备注/)).toHaveFocus()
  })

  it("gives every tree control a name and reaches them by keyboard", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <CollapsibleTree
        nodes={buildTree([
          { id: "net", name: "网络设备", parent_id: null },
          { id: "rt", name: "路由器", parent_id: "net" },
        ])}
      />,
    )
    // The expander is an icon; without a name it is a mystery button.
    expect(screen.getByRole("button", { name: /收起 网络设备|展开 网络设备/ })).toBeInTheDocument()

    await user.tab()
    expect(document.activeElement).toHaveAccessibleName()
  })

  it("marks tree structure for assistive technology", () => {
    renderWithProviders(
      <CollapsibleTree
        nodes={buildTree([
          { id: "net", name: "网络设备", parent_id: null },
          { id: "rt", name: "路由器", parent_id: "net" },
        ])}
        selectedId="net"
      />,
    )
    expect(screen.getByRole("tree")).toBeInTheDocument()
    const items = screen.getAllByRole("treeitem")
    expect(items[0]).toHaveAttribute("aria-expanded")
    expect(items[0]).toHaveAttribute("aria-selected", "true")
  })

  it("labels the confirmation dialog and its input", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ConfirmDialog
        trigger={<Button>删除</Button>}
        title="删除资产"
        description="此操作不可撤销。"
        confirmLabel="删除"
        requirePhrase="112394521950"
        onConfirm={vi.fn()}
      />,
    )
    await user.click(screen.getByRole("button", { name: "删除" }))

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveAccessibleName("删除资产")
    expect(screen.getByLabelText(/请输入/)).toBeInTheDocument()
  })

  it("announces the three data-view states to assistive technology", () => {
    const { unmount } = renderWithProviders(
      <StateBoundary isLoading error={null}>
        <p>never seen</p>
      </StateBoundary>,
    )
    // A spinner nobody is told about is an unexplained pause.
    expect(screen.getByRole("status")).toHaveAccessibleName("加载中…")
    unmount()

    renderWithProviders(
      <StateBoundary isLoading={false} error={new Error("网络不可用")} onRetry={vi.fn()}>
        <p>never seen</p>
      </StateBoundary>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("网络不可用")
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })

  it("names the timeline and each of its entries", () => {
    renderWithProviders(
      <Timeline
        events={[
          {
            id: "e1",
            asset_id: "a1",
            batch_id: null,
            kind: "checkout",
            from_status: "in_stock",
            from_holder: { type: "entity", id: "loc", name: "上海仓库" },
            from_owner_id: "u1",
            to_status: "in_use",
            to_holder: { type: "user", id: "u2", name: "张三" },
            to_owner_id: "u1",
            due_at: null,
            created_at: "2026-08-28T09:00:00Z",
            edited_at: null,
            edited_by: null,
          },
        ]}
      />,
    )
    expect(screen.getByRole("list", { name: "流转历史" })).toBeInTheDocument()
    expect(screen.getByRole("listitem", { name: "签出" })).toBeInTheDocument()
  })

  it("gives the retry control a reachable name", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(
      <StateBoundary isLoading={false} error={new Error("boom")} onRetry={onRetry}>
        <p>never seen</p>
      </StateBoundary>,
    )
    await user.tab()
    expect(screen.getByRole("button", { name: "重试" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(onRetry).toHaveBeenCalled()
  })
})
