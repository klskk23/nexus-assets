import {
  Cpu,
  Columns,
  Package,
  RadioButton,
  Scroll,
  ShieldCheck,
  SquaresFour,
  Tray,
  TreeStructure,
  Users,
  Warehouse,
  type Icon,
} from "@phosphor-icons/react"

/**
 * The icon each destination wears.
 *
 * Chosen for what the page holds rather than for what it is called: holders
 * are a warehouse, models are hardware, categories really are a tree, and a
 * field is a column of the ledger. The ledger itself is a package and not a
 * laptop -- it counts routers and anything else the company owns, and a
 * laptop would say the product is narrower than it is.
 *
 * Phosphor, regular weight, looked at rendered at 16px (030) -- the handoff's
 * "16px 线性图标". Every one of these was picked by eye at that size, not
 * from a name: the two libraries do not map one to one, and a name that
 * sounds right can draw the wrong thing small.
 *
 * Its own module because two places read it and neither should have to import
 * the other: the rail draws them, and an empty page borrows the one belonging
 * to the page it is empty on.
 */
export const NAV_ICONS: Record<string, Icon> = {
  "/": SquaresFour,
  "/assets": Package,
  "/categories": TreeStructure,
  "/fields": Columns,
  "/models": Cpu,
  "/statuses": RadioButton,
  "/holders": Warehouse,
  "/users": Users,
  "/roles": ShieldCheck,
  "/audit": Scroll,
}

/**
 * The icon for a path, for an empty state that wants to say *what* is empty.
 *
 * Longest prefix wins, so /fields/groups and /models/vendors inherit from the
 * page they are a tab of. Anything unrecognised gets the tray -- a route
 * added without an icon should look plain, not broken.
 */
export function navIcon(pathname: string): Icon {
  if (pathname === "/") return NAV_ICONS["/"]
  const hit = Object.keys(NAV_ICONS)
    .filter((p) => p !== "/" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0]
  return hit ? NAV_ICONS[hit] : Tray
}
