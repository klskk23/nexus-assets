/**
 * Radix's Select reserves the empty string: an item may not carry it, because
 * that is how the component represents "nothing chosen" internally.
 *
 * Filters and optional pickers here use "" for the same idea, so a stand-in
 * value crosses the boundary between them. Keeping it in one place means the
 * sentinel cannot drift into a value someone might legitimately store.
 */
export const NONE = "__none"

/** Component value → application value. */
export const fromNone = (v: string): string => (v === NONE ? "" : v)

/** Application value → component value. */
export const toNone = (v: string | null | undefined): string => (v ? v : NONE)
