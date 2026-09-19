import { useCallback, useState } from "react"

const KEY = "nexus.nav.collapsed"

/**
 * Whether the rail is folded to its icons.
 *
 * Per person and per browser, like the column choice (useColumns): it is a
 * preference about this screen, not a fact about the account, and it must
 * not travel to a phone where the rail is a strip anyway. localStorage can be
 * absent or throw (a private window, blocked site data), so every touch is
 * wrapped and the answer on failure is "expanded" -- the state a first visit
 * has.
 */
export function useNavCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1"
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c
      try {
        if (next) localStorage.setItem(KEY, "1")
        else localStorage.removeItem(KEY)
      } catch {
        /* the choice lasts the session, then */
      }
      return next
    })
  }, [])
  return [collapsed, toggle]
}
