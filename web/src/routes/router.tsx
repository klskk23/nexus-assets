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
        // The detail is a child so it renders as a dialog over the list rather
        // than instead of it -- one address, two things on screen (decision 89).
        path: "assets",
        lazy: async () => ({ Component: (await import("./Assets")).Assets }),
        children: [
          {
            path: ":id",
            lazy: async () => ({ Component: (await import("./AssetDetail")).AssetDetail }),
          },
        ],
      },
      {
        // The full timeline is its own page, so it is not nested here.
        path: "assets/:id/history",
        lazy: async () => ({ Component: (await import("./AssetHistory")).AssetHistory }),
      },
      { path: "categories", lazy: async () => ({ Component: (await import("./Categories")).Categories }) },
      { path: "fields", lazy: async () => ({ Component: (await import("./Fields")).Fields }) },
      { path: "models", lazy: async () => ({ Component: (await import("./Models")).Models }) },
      { path: "statuses", lazy: async () => ({ Component: (await import("./Statuses")).Statuses }) },
      { path: "holders", lazy: async () => ({ Component: (await import("./Holders")).Holders }) },
      { path: "roles", lazy: async () => ({ Component: (await import("./Roles")).Roles }) },
      { path: "audit", lazy: async () => ({ Component: (await import("./Audit")).Audit }) },
      { path: "import", lazy: async () => ({ Component: (await import("./Import")).Import }) },
      { path: "users", lazy: async () => ({ Component: (await import("./Users")).Users }) },
    ],
  },
])
