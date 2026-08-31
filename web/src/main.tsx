import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import { router } from "./routes/router"
import { queryClient } from "./lib/queryClient"
import { AuthProvider } from "./features/auth/useAuth"
import { ThemeProvider } from "./features/theme/useTheme"
import { LanguageProvider } from "./i18n/useLanguage"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* Inside the query client: switching language clears the cache, so
            server-rendered strings do not survive the switch. */}
        <LanguageProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
