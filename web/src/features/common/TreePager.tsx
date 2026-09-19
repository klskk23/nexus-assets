import { CaretLeft, CaretRight } from "@phosphor-icons/react"

import { t } from "@/i18n"
import { Button } from "@/components/ui/button"

interface Props {
  page: number
  pageCount: number
  onPage: (page: number) => void
}

/**
 * Paging for a 280px rail: which page, and the two ways out of it.
 *
 * Not `Pager`. That one is a whole row -- range, numbered pages, page size --
 * built for the space under a table, and a rail cannot hold it. Reaching for
 * it anyway would import its assumptions along with its markup, which is the
 * judgement 024 already made about `ListToolbar` in this same rail.
 *
 * What a rail page holds is the caller's business. For a tree it is N roots
 * and everything beneath them rather than N rows, so that no row is ever shown
 * without its parent -- 014 decision 91, which is why the count here is pages
 * and not items.
 */
export function TreePager({ page, pageCount, onPage }: Props) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between gap-1 px-1">
      <Button
        variant="secondary"
        size="icon-sm"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        aria-label={t.assets.prevPage}
      >
        <CaretLeft />
      </Button>
      <span className="text-neutral-500 text-xs tabular-nums">
        {page + 1} / {pageCount}
      </span>
      <Button
        variant="secondary"
        size="icon-sm"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        aria-label={t.assets.nextPage}
      >
        <CaretRight />
      </Button>
    </div>
  )
}
