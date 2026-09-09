import { Navigate, createBrowserRouter } from "react-router"

import { AppShell } from "./AppShell"
import { Login } from "./Login"

/**
 * Management pages are lazy so they stay out of the initial chunk, which the
 * constitution caps at 500KB gzip.
 */
export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  {
    path: "/",
    Component: AppShell,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./Overview")).Overview }) },
      {
        path: "assets",
        lazy: async () => ({ Component: (await import("./Assets")).Assets }),
      },
      {
        // A page, not a child rendering as a dialog over the list (022 replaces
        // decision 89). The dialog existed to keep the list -- and therefore
        // its filters -- alive behind it; the filters live in the address bar
        // instead, and the detail carries them so it can hand them back. What
        // the dialog cost was the whole timeline: forty events do not fit in a
        // box, so they needed a second page. A page has room, so that page is
        // gone too.
        path: "assets/:id",
        lazy: async () => ({ Component: (await import("./AssetDetail")).AssetDetail }),
      },
      // Two paths, one component. Not a parent with an <Outlet />: the tree
      // has to stay put while the right pane changes, and splitting it across
      // a route boundary would mean the search term, the category list and the
      // selection all live above a child that needs all three -- the shape 016
      // decision 107 warns about.
      { path: "categories", lazy: async () => ({ Component: (await import("./Categories")).Categories }) },
      { path: "categories/:id", lazy: async () => ({ Component: (await import("./Categories")).Categories }) },
      // Fields and their groups on one page, models under their vendors on
      // another (025). Both were two tabs; both are one thing seen from two
      // sides, and the tab hid the side you were not on.
      { path: "fields", lazy: async () => ({ Component: (await import("./Fields")).Fields }) },
      { path: "fields/:id", lazy: async () => ({ Component: (await import("./Fields")).Fields }) },
      { path: "models", lazy: async () => ({ Component: (await import("./Models")).Models }) },
      { path: "models/:id", lazy: async () => ({ Component: (await import("./Models")).Models }) },
      // Redirects, not pages. 025 merged both pairs into one master-detail
      // page each; these two addresses are in people's bookmarks and in the
      // internal notes, and a 404 there teaches nothing.
      { path: "models/vendors", element: <Navigate to="/models" replace /> },
      { path: "fields/groups", element: <Navigate to="/fields" replace /> },
      { path: "statuses", lazy: async () => ({ Component: (await import("./Statuses")).Statuses }) },
      { path: "holders", lazy: async () => ({ Component: (await import("./Holders")).Holders }) },
      { path: "roles", lazy: async () => ({ Component: (await import("./Roles")).Roles }) },
      { path: "audit", lazy: async () => ({ Component: (await import("./Audit")).Audit }) },
      {
        // Its own route, not a tab over /audit: both lists filter and both
        // page, and two of those behind one address trample each other's
        // query string (016, decision 107).
        path: "audit/transfers",
        lazy: async () => ({ Component: (await import("./TransferAudit")).TransferAudit }),
      },
      { path: "users", lazy: async () => ({ Component: (await import("./Users")).Users }) },
    ],
  },
])
