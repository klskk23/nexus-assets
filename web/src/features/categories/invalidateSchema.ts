import type { QueryClient } from "@tanstack/react-query"

/** All projections of effective fields must refresh together after schema writes. */
export function invalidateSchema(queryClient: QueryClient) {
  return Promise.all([
    "categories", "schema", "category-schema", "fields", "field-groups", "assets", "asset",
    "binding-asset-count", "field-asset-count", "referrers", "category-counts", "overview",
  ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
}
