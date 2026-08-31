import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { applyLang, getLang, type Lang } from "@/i18n"

interface LanguageState {
  lang: Lang
  setLang: (l: Lang) => void
}

const Ctx = createContext<LanguageState | null>(null)

/**
 * Holds the interface language.
 *
 * Switching remounts everything below it, by keying the subtree on the
 * language. The dictionaries are module-level bindings rather than context
 * values, so React has no way to know they changed -- a remount is the honest
 * way to make every rendered string follow. The cost is component state: a
 * half-typed dialog is cleared by switching language. That is a fair trade for
 * an action taken a handful of times a session, and it is why the language
 * lives up here rather than inside any one page.
 *
 * The server is told too: every request carries Accept-Language, so a refusal
 * comes back in the same language as the button that caused it.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang)
  const queryClient = useQueryClient()

  const setLang = useCallback(
    (next: Lang) => {
      if (next === lang) return
      applyLang(next)
      setLangState(next)
      // Cached responses were rendered by the server in the old language --
      // CSV headers, refusal messages, import previews. Dropping them is what
      // stops a stale Chinese error sitting under an English page.
      queryClient.clear()
    },
    [lang, queryClient],
  )

  return (
    <Ctx.Provider value={{ lang, setLang }}>
      <div key={lang} className="contents">
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function useLanguage(): LanguageState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider")
  return ctx
}
