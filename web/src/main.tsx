import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import { router } from "./routes/router"
import { queryClient } from "./lib/queryClient"
import { AuthProvider } from "./features/auth/useAuth"
import { ThemeProvider } from "./features/theme/useTheme"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
