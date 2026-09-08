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
    /* The rail is a block sitting on the page ground, not an area fenced off
     * from it by a hairline. That was the prototype's own first correction
     * against what it delivered, and it is the same rule as everywhere else on
     * this product: a thing is separated by its shape and its ground, not by a
     * line drawn between two areas that otherwise look identical. */
    <div className="grid h-screen grid-cols-[236px_1fr] bg-background p-3 text-foreground max-md:grid-cols-1 max-md:grid-rows-[auto_1fr] max-md:p-0">
      <div className="bg-well flex min-h-0 flex-col gap-6 rounded-[28px] pt-9 pr-[18px] pb-12 pl-[30px] max-md:flex-row max-md:items-center max-md:gap-4 max-md:rounded-none max-md:px-5 max-md:py-3">
        {/* Two lines, the second one carrying the product's one piece of
            colour. Split from the catalogue rather than written out here:
            the name is not translated, but it still has exactly one source,
            and two files spelling it themselves is two files to fix. */}
        <span className="font-heading grid text-[21px] leading-[1.15]">
          <span>{t.appName.split(" ")[0]}</span>
          <span className="text-primary">{t.appName.split(" ").slice(1).join(" ")}</span>
        </span>
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
                  "flex items-center gap-2.5 rounded-full py-[9px] pr-3.5 pl-3 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* A dot, not a number. The prototype numbered these 01-11,
                      and eleven destinations are not eleven steps -- there is
                      no order to be in, and the audit entry disappears for a
                      reader without the permission, which would leave the
                      numbering with a hole in it. What the numbers were also
                      doing, though, is worth keeping: marking the current item
                      with something other than a slab of colour. So the mark
                      stays and the counting goes. */}
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full transition-colors",
                      isActive ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  {l.label}
                </>
              )}
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
      <main className="min-h-0 overflow-y-auto bg-background pt-11 pr-10 pb-30 pl-14 max-md:p-5">
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
