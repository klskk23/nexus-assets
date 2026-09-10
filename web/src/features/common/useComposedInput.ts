import { useEffect, useState, type ChangeEvent, type CompositionEvent } from "react"

/**
 * A controlled text input that an IME can finish a word in.
 *
 * The bug this exists for, in full: every search box here is controlled by a
 * value that round-trips through the address bar. Typing 戴尔 with a pinyin
 * IME fires an `input` event per keystroke **while the composition is still
 * open** -- Chrome does, deliberately -- so the half-finished pinyin went into
 * the URL, the router re-rendered, and `value` was written back onto the input
 * mid-word. Writing to `value` during a composition disturbs the browser's
 * composition buffer, which re-inserts what it was holding, and the box ends
 * up with `ddadaidai'edai'er戴尔`: every intermediate spelling, kept.
 *
 * So the rule is: **while a composition is open, nobody touches the input.**
 * The draft is local, the outside hears nothing, and only when the IME says it
 * is done does the value leave here.
 *
 * The draft is what renders even between words. Rendering `value` directly
 * would show one stale frame after each commit, because the parent has not
 * re-rendered yet -- and the effect below keeps the draft honest whenever the
 * outside changes the value itself, which is what makes clearing the box from
 * elsewhere still work.
 *
 * Latin typing never opens a composition, so it goes through the fast path
 * unchanged: one onChange per keystroke, exactly as before.
 */
export function useComposedInput(value: string, onChange: (next: string) => void) {
  const [draft, setDraft] = useState(value)
  const [composing, setComposing] = useState(false)

  // The outside is the source of truth whenever nobody is mid-word.
  useEffect(() => {
    if (!composing) setDraft(value)
  }, [value, composing])

  return {
    value: draft,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value
      setDraft(next)
      if (!composing) onChange(next)
    },
    onCompositionStart: () => setComposing(true),
    onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
      // Everything happens here rather than being left to the `input` event
      // that follows, because browsers disagree about whether one follows at
      // all and about the order. Announcing twice with the same value costs
      // nothing; announcing never loses the word.
      const next = e.currentTarget.value
      setComposing(false)
      setDraft(next)
      onChange(next)
    },
  }
}
