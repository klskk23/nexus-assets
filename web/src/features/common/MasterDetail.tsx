import type { ReactNode } from "react"

interface Props {
  /**
   * Whether something is currently open in the detail pane.
   *
   * The only input here that is not pure layout, and it earns its place: on a
   * narrow screen the two panes cannot both be on screen, so something has to
   * say which one is. That is a question about the shape of the page, not
   * about what is in it -- this component still does not know whether the list
   * holds five things or five hundred, or what they are.
   */
  selected: boolean
  /** The left pane. Whoever renders it owns its rows entirely. */
  list: ReactNode
  /** The right pane. Same. */
  detail: ReactNode
}

/**
 * A page that is a list beside the thing currently chosen from it.
 *
 * Layout and nothing else. It does not fetch, does not sort, does not know
 * what a row looks like, and has no opinion about what belongs on the right.
 *
 * That restraint is the whole design. The obvious alternative -- one component
 * taking items, renderRow, renderDetail, onSelect -- is the shape `CrudPage`
 * already has, and this repository has written down what that cost:
 * "不要把手写的三个塞进 CrudPage —— 它会长出「没有新建按钮」「勾选列」「树」
 * 三个特例开关". Render callbacks are branches wearing the costume of
 * parameters: every new caller adds one, and the component ends up as the
 * union of every caller's requirements with no coherent idea of its own.
 *
 * So the split is: this owns the *shape* of the page, the caller owns the
 * *content* of both panes. The address-bar half of the behaviour lives in
 * useMasterSelection, for the same reason -- selection is a question about
 * ids, and ids are not layout.
 *
 * Deliberately absent, with one caller as of writing: a width knob, slots for
 * either pane's empty state (an empty pane is content, so the caller draws
 * it), and arrow-key movement between rows. The second caller may well want
 * the width; adding it then is a few lines and changes nothing that already
 * works, which is cheaper than guessing at it now.
 */
export function MasterDetail({ selected, list, detail }: Props) {
  return (
    /* 300px and the rest. minmax(0,1fr) rather than 1fr on the right: an auto
     * track is at least its widest child's min-content, so one wide row inside
     * would push the whole page out rather than scrolling within itself. */
    <div className="grid gap-[22px] md:grid-cols-[300px_minmax(0,1fr)] md:items-start">
      {/* Which pane shows on a narrow screen follows the address, so going
          back is what returns to the list -- no second "back" of its own to
          disagree with the browser's. */}
      <div className={selected ? "max-md:hidden" : undefined}>{list}</div>
      <div className={selected ? undefined : "max-md:hidden"}>{detail}</div>
    </div>
  )
}
