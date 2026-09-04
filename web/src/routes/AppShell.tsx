import { LogOutIcon, MoonIcon, SettingsIcon, SunIcon, UserIcon } from "lucide-react"
import { useState } from "react"
import { NavLink, Navigate, Outlet } from "react-router"

import { useAuth } from "@/features/auth/useAuth"
import { usePermissions, type Permission } from "@/features/auth/usePermissions"
import { useTheme } from "@/features/theme/useTheme"
import { SettingsDialog } from "@/features/settings/SettingsDialog"
import { usePreferences } from "@/features/settings/usePreferences"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "cn"

/**
 * The nav, built on each render.
 *
 * A module-level array would be evaluated once at import time and would still
 * be holding the labels of whatever language the page was first loaded in.
 */
function navLinks(can: (p: Permission) => boolean) {
  return [
    { to: "/", label: t.nav.overview },
    { to: "/assets", label: t.nav.assets },
    { to: "/categories", label: t.nav.categories },
    { to: "/fields", label: t.nav.fields },
    { to: "/models", label: t.nav.models },
    { to: "/statuses", label: t.nav.statuses },
    { to: "/holders", label: t.nav.holders },
    { to: "/users", label: t.nav.users },
    { to: "/roles", label: t.nav.roles },
    { to: "/import", label: t.nav.importPage },
    // The one page that is hidden rather than shown with dead buttons: it has
    // nothing on it a reader without the permission may see, and an entry that
    // only ever answers 403 is worse than no entry.
    ...(can("audit.read") ? [{ to: "/audit", label: t.nav.audit }] : []),
  ]
}

/** Chrome around every signed-in page, and the gate that keeps them signed in. */
export function AppShell() {
  const { user, isLoading, signOut } = useAuth()
  const { can } = usePermissions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  usePreferences(user)
  const { theme, toggle } = useTheme()

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
            {navLinks(can).map((l) => (
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
          {/* Language, theme and signing out are all "about me, not about the
              data". Three controls competing with the nav for the same bar was
              three things to read before finding the one you wanted; behind
              one menu they are one. */}
          <div className="ml-auto flex items-center gap-2 text-sm">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* No aria-label: it would override the name and leave a
                    screen-reader user unable to hear whose session this is.
                    aria-haspopup already says a menu opens. */}
                <Button variant="ghost" size="sm">
                  <UserIcon data-icon="inline-start" />
                  {user.name}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* The one-click theme flip stays here because it is used
                    daily; language and everything else moved into settings,
                    where a choice that is made twice a year belongs. */}
                <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                  <SettingsIcon />
                  {t.settings.open}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={toggle}>
                  {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                  {theme === "dark" ? t.nav.toLight : t.nav.toDark}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={signOut}>
                  <LogOutIcon />
                  {t.nav.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </div>
  )
}
