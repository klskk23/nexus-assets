import { useCallback, useRef, useState } from "react"

/**
 * What is ticked on the asset list, keyed by device rather than by row.
 *
 * A row index would be the obvious thing to store and is wrong here for a
 * reason people hit daily: the list is filtered and paged, so row 3 is a
 * different device after every filter change. Keying by id means narrowing the
 * filter cannot silently retarget a delete, and it is also what lets the count
 * stay honest -- the bar says how many devices are selected, not how many of
 * them happen to be on screen.
 *
 * Nothing here clears on a filter or page change, deliberately. Somebody
 * gathering forty devices out of six hundred does it by searching four times,
 * and a selection that empties itself between searches cannot be gathered.
 */
export interface Selection {
  ids: string[]
  /** True when this device is selected, whether or not it is on screen. */
  has: (id: string) => boolean
  /** Ticks or unticks one device. Sets the anchor a later Shift-click ranges from. */
  toggle: (id: string, index: number) => void
  /**
   * Extends from the anchor to this row, giving the whole run the state the
   * anchor row ends up in -- so Shift-clicking a run of ticked rows unticks
   * them, which is the half people expect and implementations forget.
   *
   * With no anchor (first click of the page, or the anchor's page is gone) it
   * degrades to a plain toggle rather than doing nothing.
   */
  extendTo: (id: string, index: number, pageIds: string[]) => void
  /** Ticks every row of the current page, or unticks them if all are ticked. */
  togglePage: (pageIds: string[]) => void
  /** True when every row of the current page is ticked and there is at least one. */
  pageAllSelected: (pageIds: string[]) => boolean
  /** True when some but not all of the page is ticked. */
  pageSomeSelected: (pageIds: string[]) => boolean
  /** Adds ids without removing anything -- how "select all N matching" lands. */
  add: (ids: string[]) => void
  clear: () => void
}

export function useSelection(): Selection {
  const [ids, setIds] = useState<string[]>([])
  // Not state: the anchor never affects what is rendered, and making it state
  // would re-render the whole table on every click that only moves it.
  const anchor = useRef<{ id: string; index: number } | null>(null)

  const has = useCallback((id: string) => ids.includes(id), [ids])

  const toggle = useCallback((id: string, index: number) => {
    anchor.current = { id, index }
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }, [])

  const extendTo = useCallback((id: string, index: number, pageIds: string[]) => {
    const from = anchor.current
    if (!from || !pageIds.includes(from.id)) {
      anchor.current = { id, index }
      setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
      return
    }
    const [lo, hi] = from.index < index ? [from.index, index] : [index, from.index]
    const run = pageIds.slice(lo, hi + 1)
    setIds((cur) => {
      // The clicked row decides the direction for the whole run: if it was
      // ticked, this un-ticks the range, and if it was not, it ticks it.
      const turningOn = !cur.includes(id)
      const rest = cur.filter((x) => !run.includes(x))
      return turningOn ? [...rest, ...run] : rest
    })
  }, [])

  const pageAllSelected = useCallback(
    (pageIds: string[]) => pageIds.length > 0 && pageIds.every((id) => ids.includes(id)),
    [ids],
  )
  const pageSomeSelected = useCallback(
    (pageIds: string[]) => pageIds.some((id) => ids.includes(id)) && !pageAllSelected(pageIds),
    [ids, pageAllSelected],
  )

  const togglePage = useCallback((pageIds: string[]) => {
    anchor.current = null
    setIds((cur) => {
      const all = pageIds.length > 0 && pageIds.every((id) => cur.includes(id))
      return all
        ? cur.filter((x) => !pageIds.includes(x))
        : [...cur.filter((x) => !pageIds.includes(x)), ...pageIds]
    })
  }, [])

  const add = useCallback((more: string[]) => {
    setIds((cur) => [...cur, ...more.filter((id) => !cur.includes(id))])
  }, [])

  const clear = useCallback(() => {
    anchor.current = null
    setIds([])
  }, [])

  return {
    ids,
    has,
    toggle,
    extendTo,
    togglePage,
    pageAllSelected,
    pageSomeSelected,
    add,
    clear,
  }
}
