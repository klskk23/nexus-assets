import { MoonIcon, SunIcon } from "lucide-react"
import { NavLink, Navigate, Outlet } from "react-router"

import { useAuth } from "@/features/auth/useAuth"
import { useTheme } from "@/features/theme/useTheme"
import { zh } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const links = [
  { to: "/", label: zh.nav.overview },
  { to: "/assets", label: zh.nav.assets },
  { to: "/categories", label: zh.nav.categories },
  { to: "/fields", label: zh.nav.fields },
  { to: "/models", label: zh.nav.models },
  { to: "/holders", label: zh.nav.holders },
  { to: "/users", label: zh.nav.users },
  { to: "/import", label: zh.nav.importPage },
  { to: "/audit", label: zh.nav.audit },
]

/** Chrome around every signed-in page, and the gate that keeps them signed in. */
export function AppShell() {
  const { user, isLoading, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  if (isLoading) {
    return (
      <div className="p-8" role="status" aria-label={zh.common.loading}>
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <span className="font-semibold">{zh.appName}</span>
          <nav className="flex gap-1" aria-label={zh.nav.assets}>
            {links.map((l) => (
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
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme === "dark" ? zh.nav.toLight : zh.nav.toDark}
              onClick={toggle}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              {zh.nav.signOut}
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
