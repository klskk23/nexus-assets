import { LanguagesIcon, MoonIcon, SunIcon } from "lucide-react"
import { NavLink, Navigate, Outlet } from "react-router"

import { useAuth } from "@/features/auth/useAuth"
import { useTheme } from "@/features/theme/useTheme"
import { useLanguage } from "@/i18n/useLanguage"
import { LANGS, LANG_NAMES } from "@/i18n"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * The nav, built on each render.
 *
 * A module-level array would be evaluated once at import time and would still
 * be holding the labels of whatever language the page was first loaded in.
 */
function navLinks() {
  return [
    { to: "/", label: t.nav.overview },
    { to: "/assets", label: t.nav.assets },
    { to: "/categories", label: t.nav.categories },
    { to: "/fields", label: t.nav.fields },
    { to: "/models", label: t.nav.models },
    { to: "/statuses", label: t.nav.statuses },
    { to: "/holders", label: t.nav.holders },
    { to: "/users", label: t.nav.users },
    { to: "/import", label: t.nav.importPage },
    { to: "/audit", label: t.nav.audit },
  ]
}

/** Chrome around every signed-in page, and the gate that keeps them signed in. */
export function AppShell() {
  const { user, isLoading, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const { lang, setLang } = useLanguage()

  if (isLoading) {
    return (
      <div className="p-8" role="status" aria-label={t.common.loading}>
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <span className="font-semibold">{t.appName}</span>
          <nav className="flex gap-1" aria-label={t.nav.assets}>
            {navLinks().map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm hover:bg-accent",
                    isActive && "bg-secondary font-medium",
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{user.name}</span>
            {/* Two languages, so a toggle rather than a dropdown: the label
                is the one you would switch to. */}
            <Button
              variant="ghost"
              size="sm"
              aria-label={t.nav.language}
              onClick={() => setLang(LANGS.find((l) => l !== lang)!)}
            >
              <LanguagesIcon data-icon="inline-start" />
              {LANG_NAMES[LANGS.find((l) => l !== lang)!]}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme === "dark" ? t.nav.toLight : t.nav.toDark}
              onClick={toggle}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t.nav.signOut}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </div>
  )
}
