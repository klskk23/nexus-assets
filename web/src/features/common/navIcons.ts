import {
  BoxesIcon,
  CircleDotIcon,
  Columns3Icon,
  CpuIcon,
  FolderTreeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UploadIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react"

/**
 * The icon each destination wears.
 *
 * Chosen for what the page holds rather than for what it is called: holders
 * are a warehouse, models are hardware, categories really are a tree, and a
 * field is a column of the ledger. The ledger itself is Boxes and not a
 * laptop -- it counts routers and anything else the company owns, and a
 * laptop would say the product is narrower than it is.
 *
 * Every one of these was looked at rendered at 16px with Organic's 2.75
 * stroke, not picked from a name. TextCursorInput went that way: at this size
 * it reads as a dumbbell and says nothing about a field.
 *
 * Its own module because two places read it and neither should have to import
 * the other: the rail draws them, and an empty page borrows the one belonging
 * to the page it is empty on.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboardIcon,
  "/assets": BoxesIcon,
  "/categories": FolderTreeIcon,
  "/fields": Columns3Icon,
  "/models": CpuIcon,
  "/statuses": CircleDotIcon,
  "/holders": WarehouseIcon,
  "/users": UsersIcon,
  "/roles": ShieldCheckIcon,
  "/import": UploadIcon,
  "/audit": ScrollTextIcon,
}

/**
 * The icon for a path, for an empty state that wants to say *what* is empty.
 *
 * Longest prefix wins, so /fields/groups and /models/vendors inherit from the
 * page they are a tab of. Anything unrecognised gets the inbox -- a route
 * added without an icon should look plain, not broken.
 */
export function navIcon(pathname: string): LucideIcon {
  if (pathname === "/") return NAV_ICONS["/"]
  const hit = Object.keys(NAV_ICONS)
    .filter((p) => p !== "/" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0]
  return hit ? NAV_ICONS[hit] : InboxIcon
}
