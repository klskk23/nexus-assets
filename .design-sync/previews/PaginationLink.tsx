import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "nexus-assets-web"

/**
 * The page numbers. `isActive` is what marks the page you are on: it swaps the
 * ghost link for an outline one AND sets `aria-current="page"`, so never hand
 * the current page a colour class instead -- that leaves the announcement
 * behind.
 *
 * Default size is `icon`, which is why single and double digits stay the same
 * square.
 */
export const Numbers = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationLink href="#">9</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          10
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">11</PaginationLink>
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

/**
 * `size="default"` when the link carries a word rather than a number -- the
 * size the previous/next controls set for themselves. Anything wider than two
 * digits needs it, or the label spills out of the icon square.
 */
export const Worded = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationLink href="#" size="default">
          第一页
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" size="default" isActive>
          第 12 页
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" size="default">
          最后一页
        </PaginationLink>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
)

/**
 * A link the reader cannot use is disabled by `aria-disabled` plus
 * `pointer-events-none opacity-50` -- an `<a>` takes no `disabled` attribute,
 * and dropping the link entirely makes the row jump as you page.
 */
export const Unavailable = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationLink
          href="#"
          size="default"
          aria-disabled
          className="pointer-events-none opacity-50"
        >
          第一页
        </PaginationLink>
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
    </PaginationContent>
  </Pagination>
)
