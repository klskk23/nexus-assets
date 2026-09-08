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
 * PaginationContent is the `<ul>` inside the `<nav>`, and it is the only thing
 * that may sit directly under `Pagination`. Every child of it is a
 * `PaginationItem` (`<li>`) -- a bare `<a>` or a stray `<div>` here breaks the
 * list semantics screen readers use to announce "page 3 of 7".
 */
export const TheList = () => (
  <Pagination>
    <PaginationContent>
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
        <PaginationLink href="#">4</PaginationLink>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)

/**
 * The full run of children the asset list feeds it: previous, the windowed
 * numbers with their ellipses, next. The `gap-1` between them comes from
 * PaginationContent itself -- do not add spacing to the items.
 */
export const EveryKindOfChild = () => (
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
        <PaginationLink href="#">5</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          6
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">7</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">23</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext href="#" aria-label="下一页">
          下一页
        </PaginationNext>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)
