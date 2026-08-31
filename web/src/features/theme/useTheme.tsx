import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

export type Theme = "dark" | "light"

const STORAGE_KEY = "nexus.theme"

/**
 * Dark is the default, not a preference the app waits to be told.
 *
 * index.html carries `class="dark"` from the first byte, so the page never
 * flashes white before this runs. Reading storage here can only ever move it
 * to light, never the other way round.
 */
export const DEFAULT_THEME: Theme = "dark"

function stored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === "light" || v === "dark" ? v : DEFAULT_THEME
  } catch {
    // A private window has no storage; the default still applies.
    return DEFAULT_THEME
  }
}

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const Ctx = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(stored)

  useEffect(() => {
    apply(theme)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // The choice simply will not survive a reload.
    }
  }, [])

  const toggle = useCallback(
    () => setThemeState((cur) => {
      const next = cur === "dark" ? "light" : "dark"
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* as above */
      }
      return next
    }),
    [],
  )

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider")
  return ctx
}
