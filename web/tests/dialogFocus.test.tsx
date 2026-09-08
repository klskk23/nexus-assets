import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders } from "@/test/renderWithProviders"
import { Hint } from "@/features/common/Hint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Opening a dialog must not open the explanation of the first field.
 *
 * A hint sits beside the label of the thing it explains, and labels come
 * before controls, so in several dialogs here the `?` is the first tabbable
 * node in the panel. Radix hands initial focus to the first tabbable node, and
 * a HoverCard opens on focus -- so Settings, Export, the account editor and
 * New status all greeted people with a sentence they had not asked for.
 *
 * Reproduced with the shape that caused it rather than with any one of those
 * screens: the bug belongs to the dialog, not to Settings.
 */
function Fixture() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>开</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>标题</DialogTitle>
        </DialogHeader>
        {/* The order that bites: label, then its hint, then the control. */}
        <div className="flex items-center gap-1.5">
          <Label htmlFor="f">名称</Label>
          <Hint>语言跟随账号，换一台电脑也是这个设置。</Hint>
        </div>
        <Input id="f" />
      </DialogContent>
    </Dialog>
  )
}

describe("对话框打开时的焦点", () => {
  it("不会自己弹出问号里的说明", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Fixture />)
    await user.click(screen.getByRole("button", { name: "开" }))
    await screen.findByRole("dialog")

    // Past the HoverCard's own openDelay -- asserting immediately would pass
    // whether or not the bug is there, which is how this test first went green
    // against the broken build.
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByText(/语言跟随账号/)).not.toBeInTheDocument()
  })

  it("焦点落在第一个真正的控件上，不是问号", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Fixture />)
    await user.click(screen.getByRole("button", { name: "开" }))
    await screen.findByRole("dialog")

    await waitFor(() => expect(screen.getByLabelText("名称")).toHaveFocus())
  })

  it("问号仍然能用键盘打开 —— 跳过的是落点，不是它本身", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Fixture />)
    await user.click(screen.getByRole("button", { name: "开" }))
    await screen.findByRole("dialog")

    // One Shift+Tab back from the control it belongs to.
    await user.tab({ shift: true })
    expect(screen.getByRole("button", { name: /这是什么|what/i })).toHaveFocus()
    expect(await screen.findByText(/语言跟随账号/)).toBeInTheDocument()
  })
})
