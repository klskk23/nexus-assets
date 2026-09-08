import { LogOutIcon } from "lucide-react"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { NavLink, Navigate, Outlet } from "react-router"

import { api } from "@/lib/api"
import type { Role } from "@/lib/types"
import type { ListPage } from "@/features/metadata/CrudPage"
import { useAuth } from "@/features/auth/useAuth"
import { usePermissions, type Permission } from "@/features/auth/usePermissions"
import { SettingsDialog } from "@/features/settings/SettingsDialog"
import { usePreferences } from "@/features/settings/usePreferences"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "cn"
import { NAV_ICONS } from "@/features/common/navIcons"

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

  // /me carries role_id but not the role's name. Deliberately the same query
  // key and shape the accounts page uses, so both read one cache entry.
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<ListPage<Role>>("/roles"),
  })
  const roleName = (roles.data?.items ?? []).find((r) => r.id === user?.role_id)?.name ?? ""

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
    /* The content is a panel floating on the shell's ground; the rail sits
     * straight on that ground and draws nothing of its own.
     *
     * It used to be the other way round -- the rail was a rounded block and
     * the panel was the plain area -- which stopped making sense the moment
     * the two grounds traded places: the rail and the gutter around it are now
     * the same cream, so a rounded block there would be framing air. The
     * separation comes from the panel's own ground, which is the same rule as
     * everywhere else here: a thing is told apart by its shape and its
     * surface, never by a line drawn between two areas that look alike. */
    <div className="grid h-screen grid-cols-[236px_1fr] bg-well p-3 text-foreground max-md:grid-cols-1 max-md:grid-rows-[auto_1fr] max-md:p-0">
      <div className="flex min-h-0 flex-col gap-6 px-5 pt-9 pb-10 max-md:flex-row max-md:items-center max-md:gap-4 max-md:py-3">
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
          {navLinks(can).map((l) => {
            const Icon = NAV_ICONS[l.to as keyof typeof NAV_ICONS]
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-full py-[9px] pr-3.5 pl-3 text-sm whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                {/* The icon is the mark, so there is no separate dot beside it.
                    It replaced a number the prototype had drawn here: eleven
                    destinations are not eleven steps, but they are eleven
                    different things, and a shape says which one faster than a
                    position ever did. Decorative -- the label is right there
                    and reads it out. */}
                <Icon aria-hidden className="size-4 shrink-0" />
                {l.label}
              </NavLink>
            )
          })}
        </nav>
        {/* Whose session this is, and the two things you can do about it.
         *
         * The name is the way into your own settings -- language, API keys,
         * anything about you rather than about the data. Signing out is beside
         * it as its own control rather than inside a menu: it is the one thing
         * people come to this corner to do, and a menu holding a single other
         * item was a door in front of a door.
         *
         * The initial sits on sage because that is this palette's tone for
         * something that is neither an action nor a status. The letter itself
         * is --foreground, not sage: sage on a sage tint measures 2.1:1, and
         * this is text even when it is one character. */}
        <div className="mt-auto flex items-center gap-2 max-md:mt-0 max-md:ml-auto">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title={t.settings.open}
            className="hover:bg-accent flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1.5 pr-2 pl-1.5 text-left transition-colors max-md:flex-none"
          >
            <span
              aria-hidden
              className="bg-accent-2/25 text-foreground grid size-9 shrink-0 place-items-center rounded-full text-base font-semibold"
            >
              {[...user.name.trim()][0] ?? "?"}
            </span>
            <span className="grid min-w-0 max-md:hidden">
              <span className="truncate text-sm font-semibold">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">{roleName}</span>
            </span>
            <span className="sr-only">{t.settings.open}</span>
          </button>

          <Button
            variant="outline"
            size="icon-sm"
            className="size-9 shrink-0"
            aria-label={t.nav.signOut}
            title={t.nav.signOut}
            onClick={signOut}
          >
            <LogOutIcon />
          </Button>
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <main className="bg-background min-h-0 overflow-y-auto rounded-[28px] pt-11 pr-10 pb-30 pl-14 max-md:rounded-none max-md:p-5">
        {/* The content column fills the panel. There is no rule here at all
         * any more -- a block element is already its container's width -- and
         * the div stays only because the routes below expect one wrapper.
         *
         * This is the third answer to the same question and the first one with
         * no number in it. 018 capped the column at a flat 960: the column
         * stayed put while the void grew without bound -- 14% of the panel at
         * 1440, 56% at 2560, 73% at 3840. 020 made the void a constant 24%
         * share instead, which fixed the growth but not the void: at 2560 that
         * is still 581px of nothing, and the page reads as though it failed to
         * load rather than as though it was composed.
         *
         * So the void is gone and the asymmetry with it. What separates
         * content from the screen edge is now the panel's own padding, which
         * is what padding is for. pr-10 (40px) rather than the well's 12px
         * gutter, but NOT because content would hit the 28px corner: measured,
         * the top-right buttons sit 46px below the panel's top edge and so
         * never enter the corner's 28x28 box at either padding. The reason is
         * plainer -- 56px on the left against 12px on the right reads as a
         * mistake, while 56 against 40 reads as a decision, and content that
         * close to the boundary is crowded whether or not it touches a curve.
         *
         * The cost, accepted with the screenshots in hand: a wide table spreads
         * its columns instead of ending early, and windows at and below 1548
         * are no longer pixel-for-pixel 018 (the 960 floor went with the rest
         * of the rule -- at 1440 the column is 1084). */}
        <div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
