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
      { index: true, lazy: async () => ({ Component: (await import("./Assets")).Assets }) },
      { path: "assets", lazy: async () => ({ Component: (await import("./Assets")).Assets }) },
      { path: "assets/new", lazy: async () => ({ Component: (await import("./NewAsset")).NewAsset }) },
      {
        path: "assets/:id",
        lazy: async () => ({ Component: (await import("./AssetDetail")).AssetDetail }),
      },
      { path: "categories", lazy: async () => ({ Component: (await import("./Categories")).Categories }) },
      { path: "fields", lazy: async () => ({ Component: (await import("./Fields")).Fields }) },
      { path: "models", lazy: async () => ({ Component: (await import("./Models")).Models }) },
      { path: "holders", lazy: async () => ({ Component: (await import("./Holders")).Holders }) },
      { path: "users", lazy: async () => ({ Component: (await import("./Users")).Users }) },
    ],
  },
])
