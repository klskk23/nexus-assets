import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "nexus-assets-web"

/**
 * Upstream hard-codes the word "Previous" into this control. This product is
 * bilingual, so it was patched to take `children` -- pass the label from the
 * catalogue (上一页) and give the same string to `aria-label`, because the
 * visible text is hidden below the `sm` breakpoint and the chevron alone
 * announces nothing.
 */
export const Translated = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" aria-label="上一页">
          上一页
        </PaginationPrevious>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">4</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          5
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">6</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
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
 * On the first page it stays in place, dimmed and inert:
 * `aria-disabled` + `pointer-events-none opacity-50`. Removing it instead
 * would shift every page number left by one control the moment you reached
 * page 1.
 */
export const OnTheFirstPage = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious
          href="#"
          aria-label="上一页"
          aria-disabled
          className="pointer-events-none opacity-50"
        >
          上一页
        </PaginationPrevious>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          1
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">2</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">3</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext href="#" aria-label="下一页">
          下一页
        </PaginationNext>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)
