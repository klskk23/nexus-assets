import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { PALETTE, type Status } from "@/lib/types"

export const STATUSES_KEY = "statuses"

/**
 * The canonical query. Shared verbatim with the statuses page's table, so both
 * read one cache entry rather than racing to overwrite each other's shape.
 */
export function statusesQuery() {
  return { queryKey: [STATUSES_KEY], queryFn: () => api.get<Status[]>("/statuses") }
}

/**
 * The one place a status key turns into something a person can read.
 *
 * Every screen that shows a status -- the badge, the pickers, the filter bar,
 * the overview cards, the timeline -- resolves through this. Before, the five
 * labels were spelled out in the web bundle and again in the CSV exporter,
 * which is the arrangement that drifts the moment either side is edited.
 */
export function useStatuses() {
  const query = useQuery(statusesQuery())
  const items = query.data ?? []
  const byKey = new Map(items.map((s) => [s.key, s]))

  return {
    ...query,
    statuses: items,
    colors: PALETTE,
    get: (key: string): Status | undefined => byKey.get(key),
    /**
     * Falls back to the raw key. A status can be deleted while old transfer
     * events still name it, and a timeline entry that reads `on_loan` is a
     * loss of polish; one that reads `undefined` is a bug report.
     */
    label: (key: string) => byKey.get(key)?.label ?? key,
    color: (key: string) => byKey.get(key)?.color ?? "slate",
  }
}
