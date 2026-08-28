import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { renderWithProviders } from "@/test/renderWithProviders"
import { Button } from "@/components/ui/button"

function render(onConfirm = vi.fn(), requirePhrase?: string) {
  renderWithProviders(
    <ConfirmDialog
      trigger={<Button>删除</Button>}
      title="删除资产"
      description="此操作不可撤销。请输入资产编号 112394521950 以确认。"
      confirmLabel="删除"
      requirePhrase={requirePhrase}
      onConfirm={onConfirm}
    />,
  )
  return onConfirm
}

describe("ConfirmDialog", () => {
  it("does nothing until it is opened", async () => {
    const onConfirm = render(vi.fn(), "112394521950")
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // Reading a warning is easy to do without noticing; typing the number is not.
  it("keeps the action disabled until the exact phrase is typed", async () => {
    const user = userEvent.setup()
    const onConfirm = render(vi.fn(), "112394521950")

    await user.click(screen.getByRole("button", { name: "删除" }))
    const dialog = await screen.findByRole("alertdialog")
    const confirm = within(dialog).getByRole("button", { name: "删除" })
    expect(confirm).toBeDisabled()

    const input = screen.getByLabelText(/请输入 112394521950/)
    await user.type(input, "112394521949")
    expect(confirm).toBeDisabled()

    await user.clear(input)
    await user.type(input, "112394521950")
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("forgets what was typed when it is dismissed", async () => {
    const user = userEvent.setup()
    render(vi.fn(), "112394521950")

    await user.click(screen.getByRole("button", { name: "删除" }))
    await user.type(await screen.findByLabelText(/请输入/), "112394521950")
    await user.click(screen.getByRole("button", { name: "取消" }))

    await user.click(screen.getByRole("button", { name: "删除" }))
    expect(await screen.findByLabelText(/请输入/)).toHaveValue("")
  })

  it("confirms straight away when no phrase is required", async () => {
    const user = userEvent.setup()
    const onConfirm = render(vi.fn())

    await user.click(screen.getByRole("button", { name: "删除" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).queryByLabelText(/请输入/)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "删除" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
