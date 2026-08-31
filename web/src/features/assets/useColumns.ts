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
          [categoryID]: chosen.includes(key)
            ? chosen.filter((k) => k !== key)
            : [...chosen, key],
        }
      })
    },
    [categoryID],
  )

  return { keys: all[categoryID] ?? [], toggle }
}
