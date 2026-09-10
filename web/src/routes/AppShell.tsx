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
import { navIcon } from "@/features/common/navIcons"
import { Logo } from "@/features/common/Logo"
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
    <div className="grid h-screen grid-cols-[264px_1fr] bg-well p-3 text-foreground max-md:grid-cols-1 max-md:grid-rows-[auto_1fr] max-md:p-0">
      <div className="flex min-h-0 flex-col gap-6 px-7 pt-9 pb-10 max-md:flex-row max-md:items-center max-md:gap-4 max-md:py-3">
        {/* Two lines, the second one carrying the product's one piece of
            colour. Split from the catalogue rather than written out here:
            the name is not translated, but it still has exactly one source,
            and two files spelling it themselves is two files to fix. */}
        {/* Mark and wordmark, centred as one block. The mark is not a link and
            not a button -- there is nowhere for it to go that the nav below
            does not already offer, and a logo that navigates is a second, less
            discoverable way to do what "Overview" does. */}
        {/* pl-3 is the nav pill's own left padding, so the mark's left edge
            lands on the same line the eleven nav icons start from. Centring it
            put it 32px to the right of that line -- close enough to read as a
            near-miss rather than as a choice, which is the one thing an
            alignment must never look like. */}
        <div className="flex items-center gap-3 pl-3">
          <Logo className="size-10 shrink-0" />
          <span className="font-heading grid text-[21px] leading-[1.15]">
            <span>{t.appName.split(" ")[0]}</span>
            <span className="text-primary">{t.appName.split(" ").slice(1).join(" ")}</span>
          </span>
        </div>
        <nav
          className="flex min-h-0 flex-col gap-0.5 overflow-y-auto max-md:flex-row max-md:overflow-x-auto"
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
                  name, and a tab stop here would put something in the path of
                  every keyboard user for no destination. Gone on a phone,
                  where the strip is horizontal and a label between two links
                  reads as a twelfth entry. */}
              {g.label && (
                <div
                  id={`nav-group-${g.key}`}
                  className="text-muted-foreground px-3.5 pt-3.5 pb-[5px] text-xs tracking-[0.04em] max-md:hidden"
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
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-full py-[9px] pr-3.5 pl-3 text-sm whitespace-nowrap transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground font-semibold"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )
                    }
                  >
                    {/* The icon is the mark, so there is no separate dot beside
                        it. It replaced a number the prototype had drawn here:
                        eleven destinations are not eleven steps, but they are
                        eleven different things, and a shape says which one
                        faster than a position ever did. Decorative -- the label
                        is right there and reads it out. */}
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {l.label}
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
         * The initial sits on sage because that is this palette's tone for
         * something that is neither an action nor a status. The letter itself
         * is --foreground, not sage: sage on a sage tint measures 2.1:1, and
         * this is text even when it is one character. */}
        <div className="mt-auto flex items-center justify-center gap-2 max-md:mt-0 max-md:ml-auto max-md:justify-end">
          <TruncatedTip
            text={[user.name, roleName].filter(Boolean).join(" · ")}
            isTruncated={() => nameTruncated() || roleTruncated()}
          >
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
                {/* Both lines are measured, and the tooltip names both -- one
                  control holds them, so one tooltip answers for it. The trigger
                  is the button below, which is a tab stop already. */}
                <span ref={nameText} className="truncate text-sm font-semibold">
                  {user.name}
                </span>
                <span ref={roleText} className="text-muted-foreground truncate text-xs">
                  {roleName}
                </span>
              </span>
              <span className="sr-only">{t.settings.open}</span>
            </button>
          </TruncatedTip>

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
