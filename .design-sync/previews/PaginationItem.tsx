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
 * One PaginationItem wraps one thing: a number, an ellipsis, or the
 * previous/next control. It is a bare `<li>` with no styling of its own, so it
 * carries no width and no spacing -- if a page link looks wrong, the item is
 * never the place to fix it.
 */
export const OnePerControl = () => (
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
        <PaginationLink href="#">9</PaginationLink>
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
 * Mapped out of a window function, which is how both paging tables build it.
 * The key belongs on the item, and a gap needs a key of its own -- two
 * ellipses in a list of 40 pages are two different children.
 */
export const Mapped = () => (
  <Pagination>
    <PaginationContent>
      {[1, null, 17, 18, 19, null, 40].map((n, i) =>
        n === null ? (
          <PaginationItem key={`gap-${i}`}>
            <PaginationEllipsis />
          </PaginationItem>
        ) : (
          <PaginationItem key={n}>
            <PaginationLink href="#" isActive={n === 18}>
              {n}
            </PaginationLink>
          </PaginationItem>
        ),
      )}
    </PaginationContent>
  </Pagination>
)
