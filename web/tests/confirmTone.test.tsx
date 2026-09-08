import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { renderWithProviders } from "@/test/renderWithProviders"
import { Button } from "@/components/ui/button"

/**
 * A confirmation is not automatically a warning.
 *
 * The dialog restyle drew one case -- deleting -- and it is tempting to make
 * that the shape of every confirmation, because AlertDialog is where all of
 * them live. But four of the thirteen in this product confirm something
 * ordinary: saving a model, recomputing a field, unbinding a field, resetting
 * a password. Giving those a bin and a danger-coloured button says the wrong
 * thing about what is about to happen, and a warning that shows up on ordinary
 * actions is a warning people stop reading.
 *
 * So the alarming shape is opt-in, and this file is what keeps it opt-in. It
 * fails if the default ever becomes "danger" -- which is exactly the change
 * somebody would make while wiring up the twelfth delete button.
 */
async function open(ui: React.ReactElement) {
  const user = userEvent.setup()
  renderWithProviders(ui)
  await user.click(screen.getByRole("button", { name: "开" }))
  return screen.getByRole("alertdialog")
}

const base = {
  trigger: <Button>开</Button>,
  title: "标题",
  description: "说明",
  onConfirm: vi.fn(),
}

describe("确认框的语气", () => {
  it("默认是中性的 —— 没有告警图标", async () => {
    const dialog = await open(<ConfirmDialog {...base} confirmLabel="保存" />)
    expect(dialog.querySelector("svg.lucide-trash-2")).toBeNull()
  })

  it("中性时主按钮是主色，不是危险色", async () => {
    await open(<ConfirmDialog {...base} confirmLabel="保存" />)
    const btn = screen.getByRole("button", { name: "保存" })
    expect(btn.className).toContain("bg-primary")
    expect(btn.className).not.toContain("bg-destructive")
  })

  it("声明 danger 之后才出现告警图标", async () => {
    const dialog = await open(
      <ConfirmDialog {...base} confirmLabel="删除" tone="danger" />,
    )
    expect(dialog.querySelector("svg.lucide-trash-2")).not.toBeNull()
  })

  // This one caught a real bug: AlertDialogAction defaults to the primary
  // variant, so the delete button was terracotta -- the same colour as Save --
  // and nothing in the product said otherwise. Changing the token alone would
  // not have fixed it, because this button never asked for the token.
  it("danger 的主按钮是危险色", async () => {
    await open(<ConfirmDialog {...base} confirmLabel="删除" tone="danger" />)
    const btn = screen.getByRole("button", { name: "删除" })
    expect(btn.className).toContain("bg-destructive")
    expect(btn.className).not.toContain("bg-primary ")
  })
})
