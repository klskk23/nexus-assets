import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { PAGE_SIZES } from "@/features/common/Pager"

/**
 * The state every table page has: a search box, some filters, a page and a
 * page size -- all of it mirrored into the address.
 *
 * In the address because opening a record and coming back should find the list
 * as it was. Replaced rather than pushed: filtering is not a place you
 * navigate to, and pushing would make Back walk through every keystroke of the
 * search box instead of returning to the record you just opened.
 *
 * `filters` is whatever that page narrows by, keyed the way the API names it
 * (`category_id`, `status`, `role_id`), so the same object serves the address
 * and the request. An empty string means "not filtering by this" and is left
 * out of both.
 */
export interface ListQuery {
  q: string
  setQ: (q: string) => void
  filters: Record<string, string>
  setFilter: (key: string, value: string) => void
  page: number
  setPage: (page: number) => void
  pageSize: number
  setPageSize: (size: number) => void
  /** What to send to the API: the search, the filters, offset and limit. */
  params: URLSearchParams
  /** The same without paging, for an export that should follow the filters. */
  filterParams: URLSearchParams
}

export function useListQuery(initial: Record<string, string> = {}): ListQuery {
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = useState(() => searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const key of Object.keys(initial)) {
      out[key] = searchParams.get(key) ?? initial[key]
    }
    return out
  })
  const [page, setPage] = useState(() => {
    const n = Number(searchParams.get("page"))
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  const [pageSize, setPageSize] = useState(() => {
    const n = Number(searchParams.get("limit"))
    return PAGE_SIZES.includes(n) ? n : PAGE_SIZES[0]
  })

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((cur) => ({ ...cur, [key]: value }))
  }, [])

  const filterParams = useMemo(() => {
    const out = new URLSearchParams()
    if (q) out.set("q", q)
    for (const [key, value] of Object.entries(filters)) {
      if (value) out.set(key, value)
    }
    return out
  }, [q, filters])

  // Narrowing the question sends you back to the first page. Page seven of a
  // different question is not a place anybody meant to be.
  const filterKey = filterParams.toString()
  useEffect(() => setPage(0), [filterKey, pageSize])

  const params = useMemo(() => {
    const out = new URLSearchParams(filterKey)
    out.set("limit", String(pageSize))
    out.set("offset", String(page * pageSize))
    return out
  }, [filterKey, page, pageSize])

  const address = useMemo(() => {
    const out = new URLSearchParams(filterKey)
    // Only what differs from the default, so a plain list has a plain address
    // and the common case produces a link nobody has to read past.
    if (page > 0) out.set("page", String(page))
    if (pageSize !== PAGE_SIZES[0]) out.set("limit", String(pageSize))
    return out.toString()
  }, [filterKey, page, pageSize])

  const current = searchParams.toString()
  useEffect(() => {
    if (address !== current) {
      setSearchParams(new URLSearchParams(address), { replace: true })
    }
  }, [address, current, setSearchParams])

  return { q, setQ, filters, setFilter, page, setPage, pageSize, setPageSize, params, filterParams }
}
