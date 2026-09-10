import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { Rail } from "@/features/common/Rail"
import { ListToolbar } from "@/features/common/ListToolbar"

/*
 * Typing 戴尔 with a pinyin IME, in the three boxes that search a list.
 *
 * Reported from real use: the box ended up holding
 * `ddadaidai'edai'er戴尔` -- every intermediate spelling, kept, with the
 * finished word tacked on. All three boxes are controlled by a value that
 * round-trips through the address bar, and Chrome fires an `input` event per
 * keystroke **while the composition is still open**. So the half-typed pinyin
 * went out to the URL, the router re-rendered, and `value` was written back
 * onto the input mid-word -- which disturbs the browser's composition buffer
 * and makes it re-insert what it was holding.
 *
 * The rule these assert is the fix: **while a composition is open, the outside
 * hears nothing and writes nothing.** Only the finished word leaves the box.
 *
 * jsdom has no IME, so the events are dispatched by hand -- which is exactly
 * what the browser does, and is the only part of this the fix depends on.
 */

/**
 * A rail whose search term is actually stored somewhere.
 *
 * The real pages keep it in the address bar and hand it back as a prop, so a
 * fixture that holds the value fixed would test a control nobody built: an
 * input that reverts on every commit. `onSearch` is still observed, which is
 * the half these tests are about.
 */
function StatefulRail({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState("")
  return (
    <Rail
      searchID="s"
      searchHint="名称、备注"
      search={q}
      onSearch={(next) => {
        setQ(next)
        onSearch(next)
      }}
    >
      <li />
    </Rail>
  )
}

/** One pinyin word, keystroke by keystroke, then committed. */
function typeChinese(input: HTMLElement, spellings: string[], word: string) {
  fireEvent.compositionStart(input)
  for (const s of spellings) {
    fireEvent.change(input, { target: { value: s } })
  }
  fireEvent.compositionEnd(input, { target: { value: word } })
  // Chrome fires one more input event after compositionend, carrying the same
  // committed text. Announcing twice is harmless; the test proves it.
  fireEvent.change(input, { target: { value: word } })
}

const SPELLINGS = ["d", "da", "dai", "dai'e", "dai'er"]

describe("搜索框里用输入法打中文", () => {
  it("组合过程中不向外报告，落定后只报告成品（Rail）", () => {
    const onSearch = vi.fn()
    render(<StatefulRail onSearch={onSearch} />)
    const input = screen.getByLabelText("名称、备注")

    fireEvent.compositionStart(input)
    for (const s of SPELLINGS) fireEvent.change(input, { target: { value: s } })

    // Nothing has left the box yet: the word is not finished.
    expect(onSearch).not.toHaveBeenCalled()
    // But the person can see what they are typing.
    expect(input).toHaveValue("dai'er")

    fireEvent.compositionEnd(input, { target: { value: "戴尔" } })
    expect(onSearch).toHaveBeenCalledWith("戴尔")
    expect(input).toHaveValue("戴尔")
  })

  it("成品不会带着拼音碎片（Rail）", () => {
    const onSearch = vi.fn()
    render(<StatefulRail onSearch={onSearch} />)
    const input = screen.getByLabelText("名称、备注")

    typeChinese(input, SPELLINGS, "戴尔")

    // The defect wrote every spelling into the value in turn; what the box
    // holds afterwards is the word and nothing else.
    expect(input).toHaveValue("戴尔")
    for (const call of onSearch.mock.calls) {
      expect(call[0]).toBe("戴尔")
    }
  })

  // The table pages' search box is the same shape and had the same defect.
  it("组合过程中不向外报告（ListToolbar）", () => {
    const onQ = vi.fn()
    render(<ListToolbar q="" onQ={onQ} searchHint="邮箱、姓名" />)
    const input = screen.getByLabelText("邮箱、姓名")

    fireEvent.compositionStart(input)
    for (const s of SPELLINGS) fireEvent.change(input, { target: { value: s } })
    expect(onQ).not.toHaveBeenCalled()

    fireEvent.compositionEnd(input, { target: { value: "戴尔" } })
    expect(onQ).toHaveBeenCalledWith("戴尔")
  })

  // Latin typing opens no composition, so it must still report per keystroke:
  // the list narrows as you type, and a fix for one alphabet must not slow the
  // other one down to word boundaries.
  it("拉丁字母照旧逐键报告", () => {
    const onSearch = vi.fn()
    render(<StatefulRail onSearch={onSearch} />)
    const input = screen.getByLabelText("名称、备注")

    fireEvent.change(input, { target: { value: "D" } })
    fireEvent.change(input, { target: { value: "De" } })
    fireEvent.change(input, { target: { value: "Dell" } })

    expect(onSearch.mock.calls.map((c) => c[0])).toEqual(["D", "De", "Dell"])
  })

  // Clearing from outside -- a reset button, a fresh address -- still lands,
  // because the local draft follows the value whenever no word is open.
  it("外部清空仍然生效", () => {
    const onSearch = vi.fn()
    const { rerender } = render(
      <Rail searchID="s" searchHint="名称、备注" search="戴尔" onSearch={onSearch}>
        <li />
      </Rail>,
    )
    expect(screen.getByLabelText("名称、备注")).toHaveValue("戴尔")

    rerender(
      <Rail searchID="s" searchHint="名称、备注" search="" onSearch={onSearch}>
        <li />
      </Rail>,
    )
    expect(screen.getByLabelText("名称、备注")).toHaveValue("")
  })
})
