import path from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } },
  },
  build: {
    // Not "assets": that is also an application route, and the static file
    // server would answer /assets with a 301 to the directory instead of
    // letting the SPA fallback handle it.
    assetsDir: "static",
    // Constitution principle IV: initial chunk budget is 500KB gzip.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "jsdom",
    // jsdom defaults to about:blank, which has no usable origin and therefore
    // no localStorage. The column selector stores its choice there, so tests
    // need a real origin.
    environmentOptions: { jsdom: { url: "http://localhost:5173" } },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    css: false,
  },
})
