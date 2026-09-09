import { useState } from "react"

/**
 * A node big enough to push everything else off the screen starts folded.
 *
 * Twelve children. The rail shows roughly eighteen rows at 38px in the height
 * it usually gets, so a node is folded once it is on its way to filling the
 * whole of it -- past that point "the rest of the list" stops existing. Hard
 * coded on purpose: two deployments looking different is a worse outcome than
 * one threshold being slightly wrong, and this is a question about visual
 * rhythm, not about policy.
 *
 * The judgement is **one node's children**, never the total number of rows.
 * Totals would mean adding a category somewhere quietly folds the entire tree,
 * which reads as a page that broke rather than a page that tidied itself.
 *
 * This is the third time folding has come up here. CollapsibleTree was deleted
 * for it, and 024 deleted it again; both times the objection was the same --
 * a control that hides half the answer to "what is there". What is different
 * now is that folding is conditional and the row says how many are behind it,
 * so a reader knows what they are not being shown. That was the missing piece
 * both previous times, not the control itself.
 *
 * Choices are remembered for the visit and deliberately not put in the
 * address: folding is a posture, not a place, and a link that carried it would
 * arrive at somebody else's screen with sections mysteriously shut.
 */
export const FOLD_ABOVE = 12

export interface Foldable {
  /** Whether this node's children are hidden right now. */
  isFolded: (id: string, childCount: number) => boolean
  /**
   * Flips this node.
   *
   * Takes the child count because flipping needs the *effective* state, and
   * that depends on the default. Without it, the first click on a node folded
   * by default reads its stored value as undefined, negates that to true, and
   * folds an already-folded node -- the click appears to do nothing, which is
   * the one outcome a toggle must never produce.
   */
  toggle: (id: string, childCount: number) => void
}

export function useFoldable(): Foldable {
  // Only the nodes somebody has actually touched. Storing every node's state
  // would mean deciding what happens to nodes that appear later, and the
  // answer would have to be "the default" anyway.
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  return {
    isFolded: (id, childCount) => touched[id] ?? childCount > FOLD_ABOVE,
    toggle: (id, childCount) =>
      setTouched((cur) => ({ ...cur, [id]: !(cur[id] ?? childCount > FOLD_ABOVE) })),
  }
}
