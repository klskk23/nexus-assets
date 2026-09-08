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
 * The mirror of PaginationPrevious: chevron on the trailing side, label from
 * the catalogue (下一页). Upstream ships the literal word "Next" baked in and
 * this repo patched it to accept `children` so the word could be translated --
 * so always pass one rather than letting the default English through.
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
        <PaginationLink href="#">1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
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
        <PaginationNext href="#" aria-label="下一页">
          下一页
        </PaginationNext>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)

/**
 * The last page of 137 audit entries: next is dimmed and inert, previous is
 * live. Both ends of the row keep their control at every page so the numbers
 * between them never move.
 */
export const OnTheLastPage = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationPrevious href="#" aria-label="上一页">
          上一页
        </PaginationPrevious>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">5</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">6</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          7
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationNext
          href="#"
          aria-label="下一页"
          aria-disabled
          className="pointer-events-none opacity-50"
        >
          下一页
        </PaginationNext>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)
