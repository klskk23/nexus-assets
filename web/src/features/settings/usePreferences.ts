import { useEffect, useRef } from "react"

import type { User } from "@/lib/types"
import { useLanguage } from "@/i18n/useLanguage"
import { useTheme, type Theme } from "@/features/theme/useTheme"
import type { Lang } from "@/i18n"

/**
 * Applies what the account chose, once, when it arrives.
 *
 * The browser still holds a copy so the first paint is not a flash of the
 * wrong theme; the account is what settles a disagreement between two
 * machines. Empty means the person never chose, and whatever this browser was
 * doing stands.
 *
 * Once per sign-in, deliberately: the settings dialog writes both sides at the
 * moment of the change, and re-applying on every render would fight anyone who
 * flips the theme from the menu.
 */
export function usePreferences(user: User | null) {
  const { lang, setLang } = useLanguage()
  const { theme, setTheme } = useTheme()
  const applied = useRef<string | null>(null)

  useEffect(() => {
    if (!user || applied.current === user.id) return
    applied.current = user.id
    if (user.lang && user.lang !== lang) setLang(user.lang as Lang)
    if (user.theme && user.theme !== theme) setTheme(user.theme as Theme)
  }, [user, lang, theme, setLang, setTheme])
}
