import { t } from "@/i18n"
import { cn } from "@/lib/utils"
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

export const PAGE_SIZES: number[] = [20, 50, 100]

/**
 * Which page numbers to draw: the ends, the neighbourhood of the current page,
 * and an ellipsis for each run in between.
 *
 * A list of forty pages drawn in full is a scrollbar of its own.
 */
export function pageWindow(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          {t.assets.rangeOf(
            total === 0 ? 0 : page * pageSize + 1,
            Math.min((page + 1) * pageSize, total),
            total,
          )}
        </p>
        {children}
        <Field orientation="horizontal" className="ml-auto w-auto">
          <FieldLabel htmlFor="page-size" className="text-muted-foreground text-sm">
            {t.assets.perPage}
          </FieldLabel>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger id="page-size" size="sm" className="w-24">
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
      </div>

      {pageCount > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-label={t.assets.prevPage}
                aria-disabled={page === 0}
                className={cn(page === 0 && "pointer-events-none opacity-50")}
                onClick={(e) => {
                  e.preventDefault()
                  onPage(Math.max(0, page - 1))
                }}
              />
            </PaginationItem>
            {pageWindow(page, pageCount).map((n, i) =>
              n === null ? (
                <PaginationItem key={`gap-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={n}>
                  <PaginationLink
                    href="#"
                    isActive={n === page}
                    onClick={(e) => {
                      e.preventDefault()
                      onPage(n)
                    }}
                  >
                    {n + 1}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-label={t.assets.nextPage}
                aria-disabled={page >= pageCount - 1}
                className={cn(page >= pageCount - 1 && "pointer-events-none opacity-50")}
                onClick={(e) => {
                  e.preventDefault()
                  onPage(Math.min(pageCount - 1, page + 1))
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </>
  )
}
