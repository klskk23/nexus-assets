import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * A dialog is as wide as it declares, never as wide as its widest child.
 *
 * The transfer dialog's footer used to hang off the panel's rounded corner in
 * English and sit flush in Chinese. The footer was not the problem: the five
 * action buttons are `shrink-0` inside a `w-fit` group, so the shortest that
 * strip can be is all five labels end to end -- 483px against the 446px the
 * panel has to give. A grid track sized `auto` is at least its widest child's
 * min-content, so the track grew past the panel's content box, every stretched
 * sibling followed, and the footer's negative margins carried that overshoot
 * out to where it was visible.
 *
 * Two invariants, because either one alone leaves the bug reachable: the panel
 * caps its track, and the strip is allowed to wrap. Widening the dialog would
 * have fixed neither -- it only moves the label length at which this returns.
 *
 * Source-level, and deliberately so, for the same reason contentColumn.test.ts
 * is: jsdom performs no layout, so every rect is zero and an assertion about
 * overhang would pass whatever the CSS said. The alignment itself was measured
 * in a browser, in both languages -- footer against panel, ±1px, which is the
 * panel's own border.
 */
function read(rel: string): string {
  return readFileSync(join(import.meta.dirname, "..", "src", rel), "utf8")
}

describe("对话框的宽度由自己决定", () => {
  it("面板的 grid 轨道封了顶，孩子撑不动它", () => {
    expect(read("components/ui/dialog.tsx")).toContain("grid-cols-[minmax(0,1fr)]")
  })

  // Separated items, because a joined strip cannot wrap: the row below would
  // start with the seam meant for the middle of the strip.
  it("流转的动作条可以换行", () => {
    const src = read("features/transfers/TransferForm.tsx")
    const group = src.slice(src.indexOf("<ToggleGroup"), src.indexOf("</ToggleGroup>"))
    expect(group).toContain("flex-wrap")
    expect(group).toContain("spacing={1}")
  })
})
