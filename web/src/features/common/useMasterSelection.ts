/**
 * Which of a list of ids is open, and where to go when none is.
 *
 * Ids only. It never sees the items themselves, so it cannot grow an opinion
 * about how they are ordered, what they are called, or which of them is
 * special -- the caller has already answered all three by the time it hands
 * over the array.
 *
 * The pair to MasterDetail: that one owns the shape of the page, this one owns
 * the part of the behaviour that has to live in the address. Split rather than
 * combined because they change for different reasons.
 */
export interface MasterSelection {
  /** The id to show, or "" when there is nothing to show. */
  current: string
  /**
   * True when the address named an id the list does not contain.
   *
   * Distinct from "nothing named": one is a stale link that has to be said out
   * loud, the other is simply the front door.
   */
  missing: boolean
}

export function useMasterSelection(ids: string[], id: string | undefined): MasterSelection {
  const wanted = id ?? ""
  const known = wanted !== "" && ids.includes(wanted)

  if (known) return { current: wanted, missing: false }

  // Named something that is not here. Not quietly swapped for a neighbour:
  // landing on a different one answers a question nobody asked, and the reader
  // never learns the link they followed is stale.
  if (wanted !== "") return { current: "", missing: true }

  // Nothing named: the first entry, so the page opens with something to read
  // rather than half a screen of nothing.
  //
  // A default, not a redirect. Rewriting the address to name the first entry
  // is the tempting version and it breaks the narrow screen: there the two
  // panes are two pages, so the address with no id *is* the list page -- and a
  // redirect off it means the list can never be reached at all. Every entrance
  // to it lands on a detail instead.
  return { current: ids[0] ?? "", missing: false }
}
