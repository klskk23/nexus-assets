import {
  Field,
  FieldLabel,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

/**
 * The pager row exactly as the asset list and the audit log draw it, and the
 * only pagination this product has: the range on the LEFT, the page links in
 * the MIDDLE, the per-page picker on the RIGHT -- one row, not two. Stacked in
 * two rows they read as two unrelated controls that happen to sit near
 * each other.
 *
 * It belongs BELOW the table. Paging is what you want after reading a page,
 * not before it.
 */
export const ListFooter = () => (
  <div
    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    style={{ width: "100%" }}
  >
    <p className="text-muted-foreground text-sm">第 41–60 条，共 137 条</p>

    <Pagination className="mx-0 w-auto flex-1">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" aria-label="上一页">
            上一页
          </PaginationPrevious>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">2</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>
            3
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">4</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">7</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" aria-label="下一页">
            下一页
          </PaginationNext>
        </PaginationItem>
      </PaginationContent>
    </Pagination>

    <Field orientation="horizontal" className="w-auto">
      <FieldLabel htmlFor="pagination-per-page" className="text-muted-foreground text-sm">
        每页
      </FieldLabel>
      <Select defaultValue="20">
        <SelectTrigger id="pagination-per-page" size="sm" className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="20">20 条</SelectItem>
            <SelectItem value="50">50 条</SelectItem>
            <SelectItem value="100">100 条</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  </div>
)

/**
 * Forty pages of audit entries. Never draw them all -- a list of forty page
 * links is a scrollbar of its own. Draw the two ends, the neighbourhood of the
 * current page, and one ellipsis per run in between.
 */
export const Windowed = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" aria-label="上一页">
          上一页
        </PaginationPrevious>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">11</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          12
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">13</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">40</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext href="#" aria-label="下一页">
          下一页
        </PaginationNext>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)

/**
 * Seven pages or fewer are all drawn -- no window, no ellipsis. Below one page
 * the whole nav disappears; the row keeps only the "共 8 条" count, which
 * answers a different question.
 */
export const AllPagesDrawn = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" aria-label="上一页">
          上一页
        </PaginationPrevious>
      </PaginationItem>
      {[1, 2, 3, 4, 5].map((n) => (
        <PaginationItem key={n}>
          <PaginationLink href="#" isActive={n === 1}>
            {n}
          </PaginationLink>
        </PaginationItem>
      ))}
      <PaginationItem>
        <PaginationNext href="#" aria-label="下一页">
          下一页
        </PaginationNext>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)
