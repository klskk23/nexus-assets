import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "nexus.assetColumns"

/** One list of chosen columns per category id. */
type Stored = Record<string, string[]>

/**
 * Reads the stored selection, ignoring the shape this used to have.
 *
 * It was one flat list for every category, which is the bug this replaced:
 * columns ticked under one category came back as headers under another, where
 * the field does not exist and every cell is empty.
 */
function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Stored
  } catch {
    return {}
  }
}

/**
 * Remembers which custom-field columns the list shows, per category.
 *
 * Per category because the columns on offer are the category's own fields:
 * carrying a choice across is carrying it to a place where it means nothing.
 * With no category chosen there are no custom fields at all, so the selection
 * is empty and the picker does not appear.
 *
 * The choice is per person and per browser, so it lives in localStorage rather
 * than on the server: making it a stored setting would mean one team member's
 * preference silently changing everyone else's view. Every access is guarded --
 * a private window can throw on read as well as write.
 */
export function useColumnSelection(categoryID: string) {
  const [all, setAll] = useState<Stored>(read)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    } catch {
      /* nothing to do; the selection simply will not survive a reload */
    }
  }, [all])

  const toggle = useCallback(
    (key: string) => {
      setAll((cur) => {
        const chosen = cur[categoryID] ?? []
        return {
          ...cur,
          [categoryID]: chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key],
        }
      })
    },
    [categoryID],
  )

  return { keys: all[categoryID] ?? [], toggle }
}

/** The built-in columns a person can turn off, in the order they appear. */
export const BUILTIN_COLUMNS = [
  "category",
  "status",
  "holder",
  "model",
  "vendor",
  "owner",
  "note",
] as const

export type BuiltinColumn = (typeof BUILTIN_COLUMNS)[number]

/**
 * What a fresh browser shows.
 *
 * Everything except the vendor: it matters when two suppliers sell the same
 * model, which is a real case and not the common one, so it is a tick away
 * rather than a column everybody carries.
 */
const BUILTIN_DEFAULT: BuiltinColumn[] = ["category", "status", "holder", "model", "owner", "note"]

const BUILTIN_KEY = "nexus.assetBuiltins"

/**
 * Remembers which built-in columns the list shows.
 *
 * Not per category, unlike the field columns: these exist on every device
 * whatever its category, so a choice made under one is meaningful under all of
 * them. Stored per person and per browser for the same reason the field
 * selection is -- one colleague's preference must not change everyone's view.
 *
 * The number is not here and cannot be turned off: it is what a row is read by
 * and what the click opens.
 */
export function useBuiltinColumns() {
  const [keys, setKeys] = useState<BuiltinColumn[]>(() => {
    try {
      const raw = localStorage.getItem(BUILTIN_KEY)
      if (!raw) return BUILTIN_DEFAULT
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return BUILTIN_DEFAULT
      // Filtered against what exists, so a column removed in a later version
      // cannot come back as a header with nothing under it.
      return BUILTIN_COLUMNS.filter((k) => (parsed as string[]).includes(k))
    } catch {
      return BUILTIN_DEFAULT
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(BUILTIN_KEY, JSON.stringify(keys))
    } catch {
      /* private mode; the choice simply will not survive a reload */
    }
  }, [keys])

  const toggle = useCallback((key: BuiltinColumn) => {
    setKeys((cur) =>
      cur.includes(key)
        ? cur.filter((k) => k !== key)
        : BUILTIN_COLUMNS.filter((k) => k === key || cur.includes(k)),
    )
  }, [])

  return { keys, shows: (k: BuiltinColumn) => keys.includes(k), toggle }
}
