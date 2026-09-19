import { SignOut } from "@phosphor-icons/react"
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
import { navIcon } from "@/features/common/navIcons"
import { Logo } from "@/features/common/Logo"
import { useNavCollapsed } from "@/features/common/useNavCollapsed"
import { TruncatedTip, useTruncated } from "@/features/common/Ellipsis"

/**
 * The nav, built on each render.
 *
 * A module-level array would be evaluated once at import time and would still
 * be holding the labels of whatever language the page was first loaded in.
 *
 * Three groups, because eleven entries in one column is a list you read rather
 * than a place you know your way around. The split is by what the entry is
 * for, not by permission: the ledger itself, the things that decide what a
 * device can record, and who may do it. Grouping by permission would have been
 * easy to compute and wrong -- half of "configuration" is readable by
 * everyone, and the groups would rearrange themselves per account.
 *
 * The first group has no heading. Overview and assets are what this product
 * is; naming them adds a word above the two entries nobody needs help finding,
 * and the space it costs is at the top of the rail where it is most visible.
 * The other two earn their headings by not being obvious from their entries --
 * "fields" and "statuses" say nothing about being settings until something
 * says so.
 */
function navGroups(can: (p: Permission) => boolean) {
  return [
    {
      key: "ledger",
      label: "",
      items: [
        { to: "/", label: t.nav.overview },
        { to: "/assets", label: t.nav.assets },
      ],
    },
    {
      key: "config",
      label: t.nav.groupConfig,
      items: [
        { to: "/categories", label: t.nav.categories },
        { to: "/fields", label: t.nav.fields },
        { to: "/models", label: t.nav.models },
        { to: "/statuses", label: t.nav.statuses },
        { to: "/holders", label: t.nav.holders },
      ],
    },
    {
      key: "access",
      label: t.nav.groupAccess,
      items: [
        { to: "/users", label: t.nav.users },
        { to: "/roles", label: t.nav.roles },
        // The one page that is hidden rather than shown with dead buttons: it
        // has nothing on it a reader without the permission may see, and an
        // entry that only ever answers 403 is worse than no entry. Which is
        // why this group can arrive with two entries rather than three, and
        // why its heading must not promise an audit that is not there -- it
        // says "access and audit" of the group, not of any one row.
        // Either half is enough to have somewhere to go, and movements are
        // where this entry lands when a person can open both: who has the
        // device is asked daily, who renamed a field is asked when something
        // has already gone wrong.
        ...(can("audit.read") || can("transfer.audit")
          ? [{ to: can("transfer.audit") ? "/audit/transfers" : "/audit", label: t.nav.audit }]
          : []),
      ],
    },
  ]
}

/** Chrome around every signed-in page, and the gate that keeps them signed in. */
export function AppShell() {
  const { user, isLoading, signOut } = useAuth()
  const { can } = usePermissions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collapsed, toggleCollapsed] = useNavCollapsed()
  usePreferences(user)

  // /me carries role_id but not the role's name. Deliberately the same query
  // key and shape the accounts page uses, so both read one cache entry.
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<ListPage<Role>>("/roles"),
  })
  const roleName = (roles.data?.items ?? []).find((r) => r.id === user?.role_id)?.name ?? ""
  const { ref: nameText, isTruncated: nameTruncated } = useTruncated<HTMLSpanElement>()
  const { ref: roleText, isTruncated: roleTruncated } = useTruncated<HTMLSpanElement>()

  if (isLoading) {
    return (
      <div className="p-8" role="status" aria-label={t.common.loading}>
        <Skeleton className="h-10 w-48" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />

  const [brandFirst, ...brandRest] = t.appName.split(" ")

  return (
    /* Two columns that each own their scrolling, not one long page (handoff:
     * 216px minmax(0,1fr), 100vh, both min-height:0 overflow-y:auto).
     *
     * h-screen with min-h-0 on both children is what makes that work: without
     * min-h-0 a grid child refuses to shrink below its content, the panel never
     * becomes a scroll container, and the whole thing scrolls as one -- taking
     * the nav off the top of the screen, which is the one thing a fixed rail is
     * for. The rail is a nav landmark; the panel is the document.
     *
     * Folded, the rail is 60px of icons. Only from md up: on a phone the rail
     * is already a strip along the top, and a second collapse of it would be
     * two answers to one question. The preference is remembered per browser
     * (useNavCollapsed); the brand block is the switch, since it is not a
     * link -- there is nowhere for it to go that "Overview" does not offer. */
    <div
      data-collapsed={collapsed || undefined}
      className={cn(
        "grid h-screen text-foreground max-md:grid-cols-1 max-md:grid-rows-[auto_1fr]",
        collapsed ? "md:grid-cols-[60px_minmax(0,1fr)]" : "md:grid-cols-[216px_minmax(0,1fr)]",
      )}
    >
      <div
        data-slot="rail"
        className={cn(
          "border-border flex min-h-0 flex-col border-r bg-[linear-gradient(to_bottom,var(--card),var(--background)_60%)] p-[18px_12px_14px] max-md:flex-row max-md:items-center max-md:gap-4 max-md:border-r-0 max-md:border-b max-md:py-3",
          collapsed && "md:items-center md:px-2",
        )}
      >
        {/* The brand block: a 28px square wearing the mark, and the name in
            two colours. Split from the catalogue rather than written out here:
            the name is not translated, but it still has exactly one source.
            The whole thing is the fold switch. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t.nav.expand : t.nav.collapse}
          title={collapsed ? t.nav.expand : t.nav.collapse}
          className="hover:bg-accent flex items-center gap-2.5 rounded-md px-1.5 py-1 text-left max-md:pointer-events-none"
        >
          <Logo className="size-7" />
          <span
            className={cn(
              "font-heading text-[15px] leading-tight whitespace-nowrap",
              collapsed && "md:hidden",
            )}
          >
            {brandFirst} <span className="text-primary">{brandRest.join(" ")}</span>
          </span>
        </button>

        <nav
          className="mt-4 flex min-h-0 flex-col gap-0.5 overflow-y-auto max-md:mt-0 max-md:flex-row max-md:overflow-x-auto"
          aria-label={t.nav.label}
        >
          {navGroups(can).map((g) => (
            /* A group is a box, not a run of siblings with margins: the
             * heading and its entries have to move together when the rail
             * turns into a horizontal strip on a phone, and the only thing
             * that changes there is this box's direction.
             *
             * role="group" only where there is a name to give it. An unnamed
             * group announces "group ... group end" around two links and tells
             * a listener nothing they could not already hear. */
            <div
              key={g.key}
              role={g.label ? "group" : undefined}
              aria-labelledby={g.label ? `nav-group-${g.key}` : undefined}
              className="flex flex-col gap-0.5 max-md:flex-row"
            >
              {/* Named by aria-labelledby above rather than repeated into an
                  aria-label, so the words are said once. Not a heading element
                  and not focusable: it is a divider that happens to have a
                  name. Gone on a phone, where the strip is horizontal and a
                  label between two links reads as a twelfth entry; gone when
                  folded, where there is no room for a word. */}
              {g.label && (
                <div
                  id={`nav-group-${g.key}`}
                  className={cn(
                    "text-neutral-500 px-2.5 pt-3.5 pb-1 text-[11px] tracking-[0.06em] max-md:hidden",
                    collapsed && "md:hidden",
                  )}
                >
                  {g.label}
                </div>
              )}
              {g.items.map((l) => {
                // Through navIcon, not by indexing the table: an entry may
                // point at a sub-route (the audit's entry opens whichever half
                // the person can read), and a table lookup answers those with
                // undefined, which React renders by taking the whole shell
                // down. navIcon is the function written for exactly this --
                // longest prefix wins, and anything unknown looks plain rather
                // than broken.
                const Icon = navIcon(l.to)
                return (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === "/"}
                    title={collapsed ? l.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        /* The active entry carries a short solid accent mark
                         * on the rail's left edge with a glow -- the one place
                         * in this system a rule stays solid. -left-3 is the
                         * rail's own 12px padding, so the mark sits on the
                         * edge, not beside the row. */
                        "relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] whitespace-nowrap transition-colors",
                        isActive
                          ? "bg-selected text-selected-foreground before:absolute before:top-1/2 before:-left-3 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-sm before:bg-primary before:shadow-[0_0_10px_var(--primary)] max-md:before:hidden"
                          : "text-neutral-400 hover:bg-accent hover:text-foreground",
                        collapsed && "md:justify-center md:px-0",
                      )
                    }
                  >
                    {/* The icon is the mark, so there is no separate dot beside
                        it. Decorative -- the label is right there and reads it
                        out, and when folded the title does. */}
                    <Icon aria-hidden className="size-4 shrink-0" />
                    <span className={cn(collapsed && "md:hidden")}>{l.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Whose session this is, and the two things you can do about it.
         *
         * The name is the way into your own settings -- language, API keys,
         * anything about you rather than about the data. Signing out is beside
         * it as its own control rather than inside a menu: it is the one thing
         * people come to this corner to do, and a menu holding a single other
         * item was a door in front of a door.
         *
         * Above it, a rule that fades at both ends (24px) -- Nocturne's
         * signature; box outlines and the active mark stay solid, freestanding
         * rules fade. */}
        <div
          className={cn(
            "mt-auto flex items-center gap-1 pt-3.5 before:absolute before:h-px max-md:mt-0 max-md:ml-auto max-md:pt-0",
            "relative before:top-0 before:right-0 before:left-0 before:bg-[linear-gradient(to_right,transparent,var(--border)_24px,var(--border)_calc(100%-24px),transparent)] max-md:before:hidden",
            collapsed && "md:flex-col md:gap-2",
          )}
        >
          <TruncatedTip
            text={[user.name, roleName].filter(Boolean).join(" · ")}
            isTruncated={() => nameTruncated() || roleTruncated()}
          >
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title={t.settings.open}
              className="hover:bg-accent flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors max-md:flex-none"
            >
              {/* The initial on the deepest accent step with the lightest one
                  for the letter: the one round thing in the rail. */}
              <span
                aria-hidden
                className="bg-accent-900 text-accent-200 grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium"
              >
                {[...user.name.trim()][0] ?? "?"}
              </span>
              <span className={cn("grid min-w-0 max-md:hidden", collapsed && "md:hidden")}>
                {/* Both lines are measured, and the tooltip names both -- one
                  control holds them, so one tooltip answers for it. */}
                <span ref={nameText} className="truncate text-[13px]">
                  {user.name}
                </span>
                <span ref={roleText} className="text-neutral-500 truncate text-[11px]">
                  {roleName}
                </span>
              </span>
              <span className="sr-only">{t.settings.open}</span>
            </button>
          </TruncatedTip>

          <Button
            variant="secondary"
            size="icon-sm"
            className="shrink-0"
            aria-label={t.nav.signOut}
            title={t.nav.signOut}
            onClick={signOut}
          >
            <SignOut />
          </Button>
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {/* The content area: its own scroll, the handoff's padding, and one
       * grid whose gap every page inherits. The width rule is still "the
       * panel's width, and nothing else" (020) -- no number here. */}
      <main className="bg-background min-h-0 overflow-y-auto p-[26px_36px_64px_32px] max-md:p-5">
        <div className="grid gap-[22px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
