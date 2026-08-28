import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "nexus.assetColumns"

/**
 * Remembers which custom-field columns the list shows.
 *
 * The choice is per person and per browser, so it lives in localStorage rather
 * than on the server: making it a stored setting would mean one team member's
 * preference silently changing everyone else's view. Every access is guarded --
 * a private window can throw on read as well as write.
 */
export function useColumnSelection() {
  const [keys, setKeys] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
    } catch {
      /* nothing to do; the selection simply will not survive a reload */
    }
  }, [keys])

  const toggle = useCallback((key: string) => {
    setKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]))
  }, [])

  return { keys, toggle }
}
