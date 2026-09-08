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
 * One ellipsis stands for one run of skipped pages, and it goes inside a
 * PaginationItem like every other child. It is `aria-hidden` with an
 * "More pages" label of its own, so it is a marker, not a control -- do not
 * hang a click handler on it.
 *
 * Page 18 of 40: a run is skipped on each side, so there are two of them.
 */
export const TwoGaps = () => (
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
        <PaginationLink href="#">17</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          18
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">19</PaginationLink>
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
 * On page 2 there is nothing to skip on the left, so only one ellipsis is
 * drawn. Keeping a symmetrical pair and hiding one is the version that ends up
 * with a gap marker standing between pages 1 and 2.
 */
export const OneGap = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationLink href="#">1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          2
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">3</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">40</PaginationLink>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)
