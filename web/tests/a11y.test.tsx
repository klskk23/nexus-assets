import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders } from "@/test/renderWithProviders"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
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

  // The timeline this used to check is gone: 023 turned both places that
  // rendered it into tables, which reach the accessibility tree through
  // table roles rather than through a named list. What it was protecting --
  // that a movement says what kind it is -- now lives with the tables that
  // show one, in assetDetail and the movement log.

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
