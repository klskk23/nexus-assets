import { createBrowserRouter } from "react-router"

export const router = createBrowserRouter([
  {
    path: "/",
    lazy: async () => {
      const { AppShell } = await import("./AppShell")
      return { Component: AppShell }
    },
    children: [],
  },
])
