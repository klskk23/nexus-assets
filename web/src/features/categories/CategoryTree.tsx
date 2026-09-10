import { useState } from "react"

import type { Category } from "@/lib/types"
import { tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { flattenCategories, rootIDOf, searchCategories } from "./categoryRows"
import { useFoldable } from "@/features/common/useFoldable"
import { useComposedInput } from "@/features/common/useComposedInput"
import { TreePager } from "@/features/common/TreePager"
import { clampPage, pageCount, pageOfRoots } from "@/features/common/rootPaging"
import { RailRow } from "@/features/common/RailRow"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  categories: Category[]
  /** Devices per category, subtree included. Same map the overview reads. */
  counts: Record<string, number>
  /** Non-empty switches the tree to a flat list of matches with their paths. */
  search: string
  onSearch: (q: string) => void
  /** The category currently open on the right, so its row can say so. */
  currentID: string
  onCreate: () => void
}

/**
 * Every category, with the one you are reading marked.
 *
 * **This comment used to say there was no folding and no chevrons to fold
 * with, thirty lines above the chevrons.** 024 did refuse folding, twice over
 * -- `CollapsibleTree` had been deleted for it before that -- and then 025
 * wired both folding and paging in here while extracting the shared parts, and
 * nobody came back to the paragraph. It went three rounds saying the opposite
 * of the code, and was believed: the demo database has four categories, three
 * roots and a largest node of one child, against thresholds of twelve, so
 * neither control can appear on it and the page reads as though the claim were
 * true.
 *
 * What changed between the refusals and now is not the judgement but the
 * parts. Both earlier attempts folded **unconditionally** and said nothing
 * about what was behind the fold -- a control that hides half the answer to
 * "what categories are there". `useFoldable` only folds a node whose children
 * would fill the rail on their own, and the control says how many are behind
 * it, so the reader knows what they are not being shown. Paging was refused
 * because page two of a flattened tree can open with a child whose parent was
 * the last row of page one (014 decision 91); `rootPaging` pages by root and
 * carries whole subtrees, so that cannot happen.
 *
 * Searching still flattens (014 decision 91): showing only the hits removes
 * the parents the indent was measured against, so an indented row would be
 * claiming a position under something that is not on screen. The matches carry
 * their full path instead.
 *
 * Each row is a link. The row *is* the control -- nothing clickable sits
 * inside it, so the count beside the name is text, not a second destination.
 *
 * The list and its rows carry min-w-0 for the reason Rail.tsx states at
 * length: a grid item that will not shrink sizes itself to its content and
 * walks out of a 300px rail, taking the truncation with it.
 */
/** Root categories per page. A page is N roots and all their descendants. */
const ROOTS_PER_PAGE = 12

export function CategoryTree({
  categories,
  counts,
  search,
  onSearch,
  currentID,
  onCreate,
}: Props) {
  const { deniedReason } = usePermissions()
  const folds = useFoldable()
  const [page, setPage] = useState(0)
  const composed = useComposedInput(search, onSearch)

  // Paged by root, so no category is ever shown without its parent: page two
  // of a flattened tree can open with a child whose parent was the last row of
  // page one, and an indented line under nothing claims a place that is not on
  // screen (014 decision 91).
  const roots = categories.filter((c) => !c.parent_id)
  // How many children each node has, so a node can say what it is hiding.
  const childCounts = categories.reduce<Record<string, number>>((acc, c) => {
    if (c.parent_id) acc[c.parent_id] = (acc[c.parent_id] ?? 0) + 1
    return acc
  }, {})
  const at = clampPage(page, roots.length, ROOTS_PER_PAGE)
  const searching = search.trim() !== ""
  const visible = searching
    ? categories
    : (() => {
        const keep = new Set(pageOfRoots(roots, at, ROOTS_PER_PAGE).map((c) => c.id))
        return categories.filter((c) => keep.has(rootIDOf(c)))
      })()
  const rows = searching
    ? searchCategories(categories, search)
    : flattenCategories(visible, folds.isFolded)
  const denied = deniedReason("schema.manage")

  return (
    <div className="bg-well grid gap-2.5 rounded-[28px] p-3">
      <Label htmlFor="ct-search" className="sr-only">
        {tMeta.categories.searchHint}
      </Label>
      {/* An Input rather than ListToolbar: that one is built for the strip
          above a table -- full width, room for filter controls -- and putting
          it in a 300px rail brings its assumptions along with it. */}
      {/* Spread, so the IME's composition events arrive too -- see
          useComposedInput for what happens when they do not. */}
      <Input
        id="ct-search"
        {...composed}
        placeholder={tMeta.categories.searchHint}
        className="bg-background"
      />

      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {search.trim() ? tMeta.categories.noMatches : tMeta.categories.empty}
            </EmptyTitle>
            <EmptyDescription>
              {search.trim() ? tMeta.categories.noMatchesHint : tMeta.categories.emptyHint}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid min-w-0 gap-0.5 [&>li]:min-w-0">
          {rows.map(({ category: c, depth, hasChildren, path }) => (
            <li key={c.id}>
              <RailRow
                to={`/categories/${c.id}`}
                label={path ?? c.name}
                count={counts[c.id] ?? 0}
                depth={depth}
                selected={c.id === currentID}
                folded={
                  hasChildren && !searching
                    ? folds.isFolded(c.id, childCounts[c.id] ?? 0)
                    : undefined
                }
                onFold={() => folds.toggle(c.id, childCounts[c.id] ?? 0)}
                /* The count rides on the control because the row's number
                   slot means devices here -- it cannot say two things at
                   once, and a fold that hides fifteen children without
                   saying so is the control 024 refused twice. */
                foldLabel={
                  folds.isFolded(c.id, childCounts[c.id] ?? 0)
                    ? tMeta.panes.unfoldN(childCounts[c.id] ?? 0)
                    : tMeta.panes.fold
                }
              />
            </li>
          ))}
        </ul>
      )}

      {!searching && (
        <TreePager
          page={at}
          pageCount={pageCount(roots.length, ROOTS_PER_PAGE)}
          onPage={setPage}
        />
      )}

      {/* A category, not a child of whatever is selected: the parent is a
          field on the form, so the button means the same thing wherever the
          reader happens to be standing. */}
      <Button
        variant="ghost"
        className="justify-start rounded-full text-muted-foreground"
        onClick={onCreate}
        disabled={Boolean(denied)}
        title={denied ?? undefined}
      >
        <span aria-hidden>+</span>
        {tMeta.categories.create}
      </Button>
    </div>
  )
}
