import { createBrowserRouter } from "react-router"

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
      { path: "categories", lazy: async () => ({ Component: (await import("./Categories")).Categories }) },
      { path: "fields", lazy: async () => ({ Component: (await import("./Fields")).Fields }) },
      { path: "models", lazy: async () => ({ Component: (await import("./Models")).Models }) },
      // Its own route, not a tab inside /models: a CrudPage keeps its search
      // and page number in the address, and two of them behind one address
      // would trample each other (016, decision 107).
      { path: "models/vendors", lazy: async () => ({ Component: (await import("./Vendors")).Vendors }) },
      // Beside the field library rather than on the navigation bar: a group
      // is a handful of fields, not a place of its own. Its own address for
      // the same reason vendors have one -- two CrudPages behind one would
      // share a search box and a page number.
      { path: "fields/groups", lazy: async () => ({ Component: (await import("./FieldGroups")).FieldGroups }) },
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
      { path: "import", lazy: async () => ({ Component: (await import("./Import")).Import }) },
      { path: "users", lazy: async () => ({ Component: (await import("./Users")).Users }) },
    ],
  },
])
