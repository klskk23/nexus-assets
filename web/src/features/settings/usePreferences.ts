import { useEffect, useRef } from "react"

import type { User } from "@/lib/types"
import { useLanguage } from "@/i18n/useLanguage"
import type { Lang } from "@/i18n"

/**
 * Applies what the account chose, once, when it arrives.
 *
 * The browser still holds a copy so the first paint is not a flash of the wrong
 * language; the account is what settles a disagreement between two machines.
 * Empty means the person never chose, and whatever this browser was doing
 * stands.
 *
 * Once per sign-in, deliberately: the settings dialog writes both sides at the
 * moment of the change, and re-applying on every render would fight anyone who
 * changes the language from the menu.
 *
 * Theme used to travel this same path. The server still stores users.theme and
 * still returns it -- 017 took the second ground away, not the column -- so
 * nothing here reads it and nothing writes it.
 */
export function usePreferences(user: User | null) {
  const { lang, setLang } = useLanguage()
  const applied = useRef<string | null>(null)

  useEffect(() => {
    if (!user || applied.current === user.id) return
    applied.current = user.id
    if (user.lang && user.lang !== lang) setLang(user.lang as Lang)
  }, [user, lang, setLang])
}
