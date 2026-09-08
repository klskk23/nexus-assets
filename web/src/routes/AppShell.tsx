import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react"
import { useState } from "react"
import { NavLink, Navigate, Outlet } from "react-router"

import { useAuth } from "@/features/auth/useAuth"
import { usePermissions, type Permission } from "@/features/auth/usePermissions"
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

  if (isLoading) {
    return (
      <div className="p-8" role="status" aria-label={t.common.loading}>
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />

  return (
    /* Two columns that each own their scrolling, not one long page.
     *
     * h-screen with min-h-0 on both children is what makes that work: without
     * min-h-0 a grid child refuses to shrink below its content, the panel never
     * becomes a scroll container, and the whole thing scrolls as one -- taking
     * the nav off the top of the screen, which is the one thing a fixed rail is
     * for. The rail is a nav landmark; the panel is the document. */
    <div className="grid h-screen grid-cols-[236px_1fr] bg-card text-foreground max-md:grid-cols-1 max-md:grid-rows-[auto_1fr]">
      <div className="flex min-h-0 flex-col gap-6 px-5 py-6 max-md:flex-row max-md:items-center max-md:gap-4 max-md:py-3">
        <span className="font-heading text-xl leading-none">{t.appName}</span>
        <nav
          className="flex min-h-0 flex-col gap-0.5 overflow-y-auto max-md:flex-row max-md:overflow-x-auto"
          aria-label={t.nav.assets}
        >
          {navLinks(can).map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-4 py-2 text-sm whitespace-nowrap transition-colors hover:bg-accent",
                  isActive && "bg-primary text-primary-foreground font-medium hover:bg-primary",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        {/* Language and signing out are "about me, not about the data". Two
            controls competing with the nav for the same rail was two things to
            read before finding the one you wanted; behind one menu they are
            one. It sits at the foot of the rail because that is where an
            account lives, not in the middle of the destinations. */}
        <div className="mt-auto max-md:mt-0 max-md:ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* No aria-label: it would override the name and leave a
                  screen-reader user unable to hear whose session this is.
                  aria-haspopup already says a menu opens. */}
              <Button variant="ghost" size="sm" className="w-full justify-start max-md:w-auto">
                <UserIcon data-icon="inline-start" />
                {user.name}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <SettingsIcon />
                {t.settings.open}
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

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {/* The panel is the page ground and the rail is the darker surface, not
          the other way round: cards inside are bg-card, and a card on a card is
          invisible. The corner is the only place the rail's tone shows through,
          which is the whole of the effect. */}
      <main className="min-h-0 overflow-y-auto rounded-tl-[28px] bg-background pt-11 pr-10 pb-30 pl-14 max-md:rounded-none max-md:p-5">
        {/* The content column has a ceiling and sits against the left edge.
         *
         * Not a centred column -- 017 removed the last of those, and what was
         * left was worse: no ceiling at all, so on a wide screen a line of
         * text ran the full 1600px and the eye lost the start of the next one.
         * Left-aligned with white space on the right keeps the first character
         * of every row in the same place no matter how wide the window gets,
         * which is what a ledger is read down.
         *
         * Wider content is not clipped: a table that outgrows this scrolls
         * inside its own frame. */}
        <div className="max-w-[960px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
