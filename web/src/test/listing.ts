/**
 * The list contract, for a test double: ask with paging or a search and the
 * server answers with an envelope; ask with nothing and it answers with the
 * array it always did (decision 92).
 *
 * Tests go through this rather than hardcoding one shape, because a page that
 * pages and a dropdown that wants every row call the same endpoint, and a
 * double that only knows one shape would let either half rot unnoticed.
 */
export function listed<T>(items: T[], path: string): T[] | { items: T[]; total: number; offset: number; limit: number } {
  const query = path.includes("?") ? new URLSearchParams(path.slice(path.indexOf("?") + 1)) : null
  if (!query || (!query.has("limit") && !query.has("offset") && !query.get("q"))) return items

  const q = (query.get("q") ?? "").trim().toLowerCase()
  const kept = q
    ? items.filter((it) =>
        Object.values(it as Record<string, unknown>).some(
          (v) => typeof v === "string" && v.toLowerCase().includes(q),
        ),
      )
    : items
  const offset = Number(query.get("offset") ?? 0)
  const limit = Number(query.get("limit") ?? 20)
  return { items: kept.slice(offset, offset + limit), total: kept.length, offset, limit }
}
