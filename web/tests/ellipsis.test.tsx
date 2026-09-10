import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Ellipsis, TruncatedTip } from "@/features/common/Ellipsis"

/*
 * Hovering text that does not fit says the rest of it.
 *
 * **jsdom performs no layout**, so scrollWidth and clientWidth are both 0 and
 * nothing here is ever truncated on its own. The measurement is therefore
 * stubbed: these tests pin the *decision* -- tooltip when cut off, silence
 * when not -- and the measurement itself belongs to the walkthrough, the same
 * split contentColumn.test.ts already makes for widths.
 *
 * Which is also why the guard is worth having. "Only when truncated" is the
 * whole design: a tooltip repeating a label that is fully on screen is the
 * shape of a warning people learn to ignore, and nothing else would catch its
 * removal.
 */

/** Makes an element report itself as cut off, or not. */
function measures(el: HTMLElement, { scroll, client }: { scroll: number; client: number }) {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll })
  Object.defineProperty(el, "clientWidth", { configurable: true, value: client })
}

describe("截断的文字悬停补全", () => {
  it("放不下时弹出完整内容", async () => {
    const user = userEvent.setup()
    render(<Ellipsis text="超普信息技术-南京库存中心" />)

    const span = screen.getByText("超普信息技术-南京库存中心")
    measures(span, { scroll: 400, client: 160 })

    await user.hover(span)
    await waitFor(() =>
      expect(screen.getAllByText("超普信息技术-南京库存中心").length).toBeGreaterThan(1),
    )
  })

  // The whole point of measuring rather than always attaching one.
  it("放得下就不弹", async () => {
    const user = userEvent.setup()
    render(<Ellipsis text="Dell" />)

    const span = screen.getByText("Dell")
    measures(span, { scroll: 40, client: 160 })

    await user.hover(span)
    // Nothing arrives. Given a moment, so this fails for the right reason
    // rather than by outrunning the tooltip's delay.
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.getAllByText("Dell")).toHaveLength(1)
  })

  /*
   * The variant whose trigger is the control, not the text.
   *
   * Radix opens a tooltip on its trigger's own focus, and a span is not a tab
   * stop -- so text inside a link or a button needs the control to be the
   * trigger, or a keyboard never sees it. Giving the span a tab stop instead
   * would put one on every row of a fifty-row table.
   */
  it("键盘聚焦到控件也弹（TruncatedTip）", async () => {
    const user = userEvent.setup()
    render(
      <TruncatedTip text="很长的类别名称" isTruncated={() => true}>
        <button type="button">很长的类别名称</button>
      </TruncatedTip>,
    )

    await user.tab()
    expect(screen.getByRole("button")).toHaveFocus()
    await waitFor(() =>
      expect(screen.getAllByText("很长的类别名称").length).toBeGreaterThan(1),
    )
  })

  it("控件没截断时，聚焦也不弹", async () => {
    const user = userEvent.setup()
    const isTruncated = vi.fn(() => false)
    render(
      <TruncatedTip text="短名" isTruncated={isTruncated}>
        <button type="button">短名</button>
      </TruncatedTip>,
    )

    await user.tab()
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.getAllByText("短名")).toHaveLength(1)
    // It did ask -- the silence is a decision, not a component that never ran.
    expect(isTruncated).toHaveBeenCalled()
  })

  // Truncation is a runtime fact: the same name fits on a wide screen and not
  // on a narrow one, and changes again when a badge appears beside it. So it
  // is asked at the moment of opening rather than remembered.
  it("每次悬停都重新量，不缓存上一次的结论", async () => {
    const user = userEvent.setup()
    render(<Ellipsis text="会变的名字" />)

    const span = screen.getByText("会变的名字")
    measures(span, { scroll: 40, client: 160 })
    await user.hover(span)
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.getAllByText("会变的名字")).toHaveLength(1)

    await user.unhover(span)
    measures(span, { scroll: 400, client: 160 })
    await user.hover(span)
    await waitFor(() => expect(screen.getAllByText("会变的名字").length).toBeGreaterThan(1))
  })
})
