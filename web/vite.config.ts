import path from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import type { Plugin } from "vite"

/**
 * Drops the legacy woff fallback from @font-face rules.
 *
 * Fontsource writes every src as woff2 first and woff second. The second one is
 * for browsers that predate woff2 -- meaning IE11 and Android 4 -- none of which
 * can run React 19, so it is never fetched here. Left in, Vite still emits every
 * one of those files: 197 of them, 6 MB, entirely to satisfy a url() no browser
 * will ever resolve. The whole font budget for this round is 8 MB.
 *
 * Only the woff clause is removed, so the woff2 url is untouched and a rule that
 * never had a fallback is left exactly as it was.
 *
 * This runs on the emitted bundle rather than as a source transform: Tailwind's
 * Vite plugin inlines @import itself, so a transform hook never sees the font
 * files at all -- which is exactly how the first attempt at this failed silently
 * and shipped all 197 of them.
 */
function dropWoffFallback(): Plugin {
  return {
    name: "nexus:drop-woff-fallback",
    generateBundle(_options, bundle) {
      const kept = new Set<string>()
      for (const item of Object.values(bundle)) {
        if (item.type !== "asset" || !item.fileName.endsWith(".css")) continue
        const before = String(item.source)
        const after = before.replace(/,\s*url\([^)]*\.woff\)\s*format\(("|')woff\1\)/g, "")
        item.source = after
        for (const m of after.matchAll(/url\(([^)]*\.woff)\)/g)) kept.add(m[1].split("/").pop()!)
      }
      // Anything the rewritten CSS no longer points at would ship as an asset
      // nothing can reach. Referenced ones are kept, so a font that genuinely
      // has only a woff is untouched.
      for (const [key, item] of Object.entries(bundle)) {
        if (item.fileName.endsWith(".woff") && !kept.has(item.fileName.split("/").pop()!)) {
          delete bundle[key]
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [dropWoffFallback(), react(), tailwindcss()],
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
