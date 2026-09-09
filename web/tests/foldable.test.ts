import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { FOLD_ABOVE, useFoldable } from "@/features/common/useFoldable"

describe("按节点折叠", () => {
  it("刚好在阈值上不折，超过一个才折", () => {
    const { result } = renderHook(() => useFoldable())
    expect(result.current.isFolded("a", FOLD_ABOVE)).toBe(false)
    expect(result.current.isFolded("a", FOLD_ABOVE + 1)).toBe(true)
  })

  // The judgement is one node's children, never the total. Totals would mean
  // adding a category somewhere quietly folds the whole tree.
  it("整棵树很长，但每个节点子项都少 —— 一个都不折", () => {
    const { result } = renderHook(() => useFoldable())
    const many = Array.from({ length: 200 }, (_, i) => `n${i}`)
    expect(many.every((id) => !result.current.isFolded(id, 3))) .toBe(true)
  })

  // The failure this guards: reading an untouched node's stored value as
  // false, negating it, and folding something already folded -- a click that
  // appears to do nothing.
  it("默认折起的节点，点一下要展开", () => {
    const { result } = renderHook(() => useFoldable())
    const big = FOLD_ABOVE + 5
    expect(result.current.isFolded("v", big)).toBe(true)
    act(() => result.current.toggle("v", big))
    expect(result.current.isFolded("v", big)).toBe(false)
  })

  it("手动折起一个本来展开的，也保持住", () => {
    const { result } = renderHook(() => useFoldable())
    act(() => result.current.toggle("v", 3))
    expect(result.current.isFolded("v", 3)).toBe(true)
    act(() => result.current.toggle("v", 3))
    expect(result.current.isFolded("v", 3)).toBe(false)
  })
})
