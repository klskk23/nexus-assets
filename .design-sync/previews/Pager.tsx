import { Pager } from "nexus-assets-web"

/**
 * The only pagination in this product. One row -- range on the left, pages in
 * the middle, per-page on the right -- and it goes BELOW the table, because it
 * is what you want after reading a page, not before.
 *
 * The asset table and the audit table both use this one. Do not write a second.
 */
export const MidList = () => (
  <Pager page={2} pageSize={20} total={137} onPage={() => {}} onPageSize={() => {}} />
)

/** First page: previous is disabled rather than missing. */
export const FirstPage = () => (
  <Pager page={0} pageSize={20} total={137} onPage={() => {}} onPageSize={() => {}} />
)

/** One page of results still shows the range -- "1–8 of 8" answers a question. */
export const SinglePage = () => (
  <Pager page={0} pageSize={20} total={8} onPage={() => {}} onPageSize={() => {}} />
)
