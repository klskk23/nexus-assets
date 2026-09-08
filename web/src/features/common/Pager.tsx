import { t } from "@/i18n"
import { cn } from "cn"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * The first one is the default, and the rest are the way out of it.
 *
 * Ten because a page of this product is read, not scrolled past: at 48px a row
 * that is about 480px of table, which leaves the filters above it and the
 * pager below it on screen together. Someone who wants the long view says so
 * and gets it remembered in the address bar.
 */
export const PAGE_SIZES: number[] = [10, 20, 50, 100]

/**
 * Which page numbers to draw: the ends, the neighbourhood of the current page,
 * and an ellipsis for each run in between.
 *
 * A list of forty pages drawn in full is a scrollbar of its own. Six is where
 * it folds: seven numbers plus two arrows is already wider than the count
 * beside it, and the ends and the neighbourhood are what anyone actually
 * clicks.
 */
export function pageWindow(current: number, count: number): (number | null)[] {
  if (count <= 6) return Array.from({ length: count }, (_, i) => i)

  const keep = new Set([0, count - 1, current, current - 1, current + 1])
  const out: (number | null)[] = []
  let gap = false
  for (let i = 0; i < count; i++) {
    if (keep.has(i)) {
      out.push(i)
      gap = false
    } else if (!gap) {
      out.push(null)
      gap = true
    }
  }
  return out
}

interface Props {
  page: number
  pageSize: number
  total: number
  onPage: (next: number) => void
  onPageSize: (next: number) => void
  /** Rendered on the left of the size picker, where the asset list puts nothing. */
  children?: React.ReactNode
}

/**
 * The range line, the page-size picker and the page links.
 *
 * One component because two tables now page: the asset list and the audit log.
 * Two copies would keep the same numbers in one place and not the other the
 * first time either was touched.
 */
export function Pager({ page, pageSize, total, onPage, onPageSize, children }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // Nothing to page through, so no paging controls: no page links, and no
  // per-page picker either -- offering "100 per page" above five rows is
  // furniture explaining that there is no furniture.
  //
  // The count stays. "共 3 条" is the answer to "how many matched my search",
  // which is a different question from "which page am I on", and the one
  // people actually came to the filtered list to ask.
  const paging = pageCount > 1 || total > PAGE_SIZES[0]

  return (
    // The count on the left, everything you can do about it on the right --
    // the page links sit next to the per-page picker rather than between the
    // two, because they answer the same question and the eye should find them
    // in one place. Smaller and tighter than the table above it: this is the
    // furniture, not the content.
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
      {/* Shown short, read out in full: "1–10 / 60" is compact enough for
          furniture and is not a sentence when spoken. */}
      <p
        className="text-muted-foreground tabular-nums"
        aria-label={t.assets.rangeOf(
          total === 0 ? 0 : page * pageSize + 1,
          Math.min((page + 1) * pageSize, total),
          total,
        )}
      >
        <span aria-hidden>
          {t.assets.rangeShort(
            total === 0 ? 0 : page * pageSize + 1,
            Math.min((page + 1) * pageSize, total),
            total,
          )}
        </span>
      </p>
      {children}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {pageCount > 1 && (
          <Pagination className="mx-0 w-auto">
            <PaginationContent className="gap-0.5">
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-label={t.assets.prevPage}
                  aria-disabled={page === 0}
                  // Icon only. The words sat either side of the numbers and
                  // made the run twice as wide as the thing it pages.
                  className={cn(
                    "size-6 gap-0 px-0 [&>span]:sr-only",
                    page === 0 && "pointer-events-none opacity-50",
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    onPage(Math.max(0, page - 1))
                  }}
                >
                  <span>{t.assets.prevPage}</span>
                </PaginationPrevious>
              </PaginationItem>
              {pageWindow(page, pageCount).map((n, i) =>
                n === null ? (
                  <PaginationItem key={`gap-${i}`}>
                    <PaginationEllipsis className="size-6" />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={n}>
                    <PaginationLink
                      href="#"
                      isActive={n === page}
                      className="size-6 text-[11px]"
                      onClick={(e) => {
                        e.preventDefault()
                        onPage(n)
                      }}
                    >
                      <span className="font-heading">{n + 1}</span>
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-label={t.assets.nextPage}
                  aria-disabled={page >= pageCount - 1}
                  className={cn(
                    "size-6 gap-0 px-0 [&>span]:sr-only",
                    page >= pageCount - 1 && "pointer-events-none opacity-50",
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    onPage(Math.min(pageCount - 1, page + 1))
                  }}
                >
                  <span>{t.assets.nextPage}</span>
                </PaginationNext>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

        {paging && (
          <Field orientation="horizontal" className="w-auto gap-2">
            {/* The label is read out but not drawn: the value already says
                "10 / 页", and a caption in front of it said it twice. */}
            <FieldLabel htmlFor="page-size" className="sr-only">
              {t.assets.perPage}
            </FieldLabel>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
              <SelectTrigger id="page-size" size="sm" className="h-6 w-[74px] gap-1 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t.assets.perPageUnit(n)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
    </div>
  )
}
