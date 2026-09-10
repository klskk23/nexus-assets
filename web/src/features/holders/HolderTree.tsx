import { useState } from "react"

import type { HolderEntity } from "@/lib/types"
import { tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { childCounts, flattenHolders, rootIDOf, searchHolders } from "./holderRows"
import { useFoldable } from "@/features/common/useFoldable"
import { Rail } from "@/features/common/Rail"
import { RailRow } from "@/features/common/RailRow"
import { TreePager } from "@/features/common/TreePager"
import { clampPage, pageCount, pageOfRoots } from "@/features/common/rootPaging"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

interface Props {
  holders: HolderEntity[]
  /** Devices standing at each holder, its subtree included. */
  counts: Record<string, number>
  search: string
  onSearch: (q: string) => void
  currentID: string
  onCreate: () => void
}

/** Root holders per page. A page is N roots and everything beneath them. */
const ROOTS_PER_PAGE = 12

/**
 * Every holder as the tree it actually is.
 *
 * The fourth rail, and the first whose hierarchy carries rules: a department
 * must hang from a company, a location may hang from either or from nothing.
 * Those rules are exactly what a flat table could not show -- 上级 was a column
 * there, so reading the shape meant assembling twenty rows in your head.
 *
 * Roots are companies and parentless locations together, by name. See
 * holderRows for why the type does not sort and does not section.
 */
export function HolderTree({ holders, counts, search, onSearch, currentID, onCreate }: Props) {
  const { deniedReason } = usePermissions()
  const folds = useFoldable()
  const [page, setPage] = useState(0)

  const byID = new Map(holders.map((h) => [h.id, h]))
  const kids = childCounts(holders)
  // Paged by root, so no holder is ever drawn without its parent: page two of
  // a flattened tree can open with a child whose parent was the last row of
  // page one, and an indented line under nothing claims a place that is not on
  // screen (014 decision 91).
  const roots = holders.filter((h) => !h.parent_id || !byID.has(h.parent_id))
  const at = clampPage(page, roots.length, ROOTS_PER_PAGE)
  const searching = search.trim() !== ""
  const visible = searching
    ? holders
    : (() => {
        const keep = new Set(pageOfRoots(roots, at, ROOTS_PER_PAGE).map((h) => h.id))
        return holders.filter((h) => keep.has(rootIDOf(h, byID)))
      })()
  const rows = searching ? searchHolders(holders, search) : flattenHolders(visible, folds.isFolded)
  const denied = deniedReason("holder.create")

  return (
    <Rail
      searchID="ht-search"
      searchHint={tMeta.holders.searchHint}
      search={search}
      onSearch={(q) => {
        onSearch(q)
        setPage(0)
      }}
      pager={
        searching ? null : (
          <TreePager
            page={at}
            pageCount={pageCount(roots.length, ROOTS_PER_PAGE)}
            onPage={setPage}
          />
        )
      }
      actions={
        /* A holder, not a child of whatever is selected: the parent is a field
           on the form, so the button means the same thing wherever the reader
           happens to be standing (024 decision 4). */
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground flex-1 justify-start rounded-full"
          onClick={onCreate}
          disabled={Boolean(denied)}
          title={denied ?? undefined}
        >
          + {tMeta.holders.create}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <li>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {searching ? tMeta.holders.noMatches : tMeta.holders.empty}
              </EmptyTitle>
              <EmptyDescription>
                {searching ? tMeta.holders.noMatchesHint : tMeta.holders.emptyHint}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </li>
      ) : (
        rows.map(({ holder: h, depth, hasChildren, path }) => (
          <li key={h.id} className="flex items-center gap-1.5">
            {/* RailRow wrapped rather than extended: what a row shows is the
                caller's business, and the three other rails do not want these
                two marks. The wrapper is what lets the name still truncate. */}
            <div className="min-w-0 flex-1">
              <RailRow
                to={`/holders/${h.id}`}
                label={path ?? h.name}
                count={counts[h.id] ?? 0}
                depth={depth}
                selected={h.id === currentID}
                folded={
                  hasChildren && !searching ? folds.isFolded(h.id, kids[h.id] ?? 0) : undefined
                }
                onFold={() => folds.toggle(h.id, kids[h.id] ?? 0)}
                foldLabel={
                  folds.isFolded(h.id, kids[h.id] ?? 0)
                    ? tMeta.panes.unfoldN(kids[h.id] ?? 0)
                    : tMeta.panes.fold
                }
              />
            </div>
            {/* The kind, said on the row rather than by which section it sits
                in. A company and a location can both be roots, so position
                alone cannot tell them apart -- and the difference decides what
                may hang underneath.

                No default-stock badge beside it any more. There is exactly one
                in the system and the page header already names it and takes
                you to it, so the badge was the same fact twice -- and it cost
                73px of a 300px rail, which is what squeezed 「Mixwan-库存点」
                down to 「Mixwan-库存...」 and pushed the row out of the card. */}
            <span className="text-muted-foreground shrink-0 pr-1 text-[11px]">
              {tMeta.entityTypes[h.type] ?? h.type}
            </span>
          </li>
        ))
      )}
    </Rail>
  )
}
