import type { Status } from "@/lib/types"

/**
 * The five statuses migration 004 seeds.
 *
 * Every screen that shows a status now resolves its label and colour through
 * GET /statuses, so a test that mocks the API has to serve it or the labels
 * come back as raw keys. Keeping the fixture in one place is what stops seven
 * test files from each inventing a slightly different set.
 */
export const statusList: Status[] = [
  {
    key: "in_stock",
    label: "在库",
    color: "green",
    sort: 10,
    builtin: true,
    requires_location: true,
    counts_as_available: true,
    terminal: false,
  },
  {
    key: "in_use",
    label: "已签出",
    color: "blue",
    sort: 20,
    builtin: true,
    requires_location: false,
    counts_as_available: true,
    terminal: false,
  },
  {
    key: "in_repair",
    label: "维修中",
    color: "amber",
    sort: 30,
    builtin: true,
    requires_location: false,
    counts_as_available: true,
    terminal: false,
  },
  {
    key: "lost",
    label: "丢失",
    color: "red",
    sort: 40,
    builtin: true,
    requires_location: false,
    counts_as_available: true,
    terminal: false,
  },
  {
    key: "retired",
    label: "已报废",
    color: "slate",
    sort: 50,
    builtin: true,
    requires_location: false,
    counts_as_available: false,
    terminal: true,
  },
]

/** Serves GET /statuses; returns undefined so callers can fall through. */
export function statusRoute(path: string): Promise<Status[]> | undefined {
  return path.startsWith("/statuses") ? Promise.resolve(statusList) : undefined
}
