import { useState } from "react"
import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders } from "@/test/renderWithProviders"
import { SearchSelect } from "@/features/common/SearchSelect"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * A dropdown opened inside a dialog takes the scroll lock for itself.
 *
 * A dialog does not only cover the page, it takes the page's scroll: Radix
 * locks it with react-remove-scroll, one non-passive `wheel` listener on the
 * document that cancels every wheel landing outside the dialog's own panel. A
 * popover panel is portalled to the end of `<body>`, so the lock counted it as
 * outside -- and the holder picker in the transfer dialog could be opened,
 * typed into and clicked, but **not scrolled**. Sixty holders, the first eight
 * reachable, no scrollbar jump and no error.
 *
 * Only the newest lock acts on an event, so the fix is for the popover to hold
 * one of its own while it is open, which is what Radix's `modal` does.
 * `lib/insideDialog.ts` carries the reasoning, including why it is asked for
 * only inside a dialog.
 *
 * **jsdom performs no layout and no scrolling**, so the wheel itself cannot be
 * tested here -- that belongs to the walkthrough, the same split
 * contentColumn.test.ts makes for widths. What is testable is the decision, and
 * its fingerprint in the DOM: a modal popover hides the rest of the document
 * from assistive tech (`aria-hidden`), which a non-modal one never does. That
 * mark is the whole chain in one assertion -- context provided by the dialog,
 * read by the popover, turned into `modal` -- and nothing else in the app
 * would notice if any link of it were removed.
 */

const holders = Array.from({ length: 40 }, (_, i) => ({
  value: `h${i}`,
  label: `分库 ${String(i).padStart(2, "0")}`,
}))

function Picker() {
  const [value, setValue] = useState("")
  return (
    <SearchSelect
      id="holder"
      value={value}
      onChange={setValue}
      options={holders}
      placeholder="选择"
    />
  )
}

/** The panel Radix marks, addressed by the slot rather than by a role: once
 *  the popover hides it, no role query can reach it any more. */
function dialogPanel() {
  return document.querySelector("[data-slot=dialog-content]")
}

describe("对话框里的下拉", () => {
  it("打开时自己锁一次滚动（对话框面板被标为 aria-hidden）", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>流转</DialogTitle>
          </DialogHeader>
          <Picker />
        </DialogContent>
      </Dialog>,
    )

    const trigger = await screen.findByRole("combobox")
    expect(dialogPanel()).not.toHaveAttribute("data-aria-hidden")

    await user.click(trigger)

    await waitFor(() => expect(dialogPanel()).toHaveAttribute("data-aria-hidden", "true"))
  })

  // The other half of the decision: everywhere else it stays as it was. The
  // asset filter bar is six of these in a row, and a modal one swallows the
  // click that would have opened the next -- moving between two filters would
  // have started costing two clicks instead of one.
  it("页面上的同一个下拉不锁（没有任何东西被藏起来）", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Picker />)

    await user.click(await screen.findByRole("combobox"))
    await screen.findByPlaceholderText("选择")

    expect(document.querySelectorAll("[data-aria-hidden]")).toHaveLength(0)
  })
})
