/**
 * One page of a tree is N roots and everything under them -- never N rows.
 *
 * Paging the flattened rows is the version that breaks: page two can open with
 * a child whose parent was the last row of page one, and an indented line
 * under nothing claims a position that is not on screen. 014 decision 91 wrote
 * that down for the category table; it is the same tree and the same trap in a
 * rail.
 *
 * Pages therefore hold different numbers of rows. A vendor with sixty models
 * is most of a page by itself, and that is the trade: uneven pages in exchange
 * for every row having its parent beside it.
 */
export function pageOfRoots<T>(roots: T[], page: number, perPage: number): T[] {
  return roots.slice(page * perPage, page * perPage + perPage)
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage))
}

/** Clamps a page number that outlived the list it indexed into. */
export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(0, page), pageCount(total, perPage) - 1)
}
