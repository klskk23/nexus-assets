import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
// Relative, not the app's "@/" alias: this file lives outside web/, so esbuild
// walks up from here and finds no tsconfig to resolve the alias with.
import { applyLang } from "../web/src/i18n"
import { MemoryRouter } from "react-router"
import type { ReactNode } from "react"

/**
 * The context every preview card renders inside, and the reason the app's own
 * components can appear here at all.
 *
 * Three of the published components read from context rather than props:
 * StatusBadge and Timeline resolve a status key to a label and a palette
 * through `useStatuses()`, and MetadataTabs renders router links. Outside a
 * provider each of those throws, so without this wrapper they would ship as
 * floor cards -- functional in a design, blank in the picker.
 *
 * The client is seeded rather than left to fetch. There is no server behind a
 * preview card: an unseeded query would sit in `pending` forever and every
 * status would render as its raw key. The seed is this product's five built-in
 * statuses with their real palettes, so a Timeline in the picker looks like a
 * Timeline in the product.
 *
 * The language is pinned to Chinese rather than detected. Headless Chrome
 * reports an English locale, which would render every card's chrome in English
 * beside content that is necessarily Chinese -- a device ledger's data is
 * Chinese whichever language its buttons are in. Pinning it makes the cards
 * agree with themselves and with the product's primary language. `t` is a
 * module-level live binding, so this must run before the first render, not in
 * an effect.
 *
 * `retry: false` matters as much as the seed: any query this does not seed
 * fails fast to an empty state instead of retrying for thirty seconds while
 * the render check screenshots a spinner.
 */
const STATUSES = [
  { key: "in_stock", label: "在库", color: "green", counts_as_available: true, terminal: false, builtin: true },
  { key: "checked_out", label: "已签出", color: "blue", counts_as_available: false, terminal: false, builtin: true },
  { key: "repairing", label: "维修中", color: "amber", counts_as_available: false, terminal: false, builtin: true },
  { key: "lost", label: "丢失", color: "red", counts_as_available: false, terminal: true, builtin: true },
  { key: "retired", label: "已报废", color: "slate", counts_as_available: false, terminal: true, builtin: true },
]

applyLang("zh")

const CATEGORIES = [
  { id: "net", code: "NET", name: "网络设备", parent_id: null, path: "/net/", display_key: "sn" },
  { id: "srv", code: "SRV", name: "服务器", parent_id: null, path: "/srv/", display_key: "" },
  { id: "pc", code: "PC", name: "办公终端", parent_id: null, path: "/pc/", display_key: "" },
]

export function DsPreviewProvider({ children }: { children?: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
  })
  client.setQueryData(["statuses"], STATUSES)
  // CategoryFilter holds its own unseeded ["categories"] query, so without this
  // it can only ever show its "all" sentinel. Truthful for a fresh install, but
  // a picker card should show the component doing its job.
  client.setQueryData(["categories"], CATEGORIES)

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/fields"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}
