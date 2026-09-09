import { Link } from "react-router"

import { cn } from "cn"
import type { Category } from "@/lib/types"
import { tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { flattenCategories, searchCategories } from "./categoryRows"
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
 * Every category, always open, with the one you are reading marked.
 *
 * No folding, and no chevrons to fold with. Categories are configuration
 * rather than data -- a handful to a few dozen -- so the whole tree fits, and
 * a control that hides part of the answer to "what categories are there" costs
 * more than the two lines it saves. `CollapsibleTree` was removed once already
 * for the neighbouring reason; this is the second time the same idea has not
 * paid for itself.
 *
 * Searching still flattens (014 decision 91): showing only the hits removes
 * the parents the indent was measured against, so an indented row would be
 * claiming a position under something that is not on screen. The matches carry
 * their full path instead.
 *
 * Each row is a link. The row *is* the control -- nothing clickable sits
 * inside it, so the count beside the name is text, not a second destination.
 */
export function CategoryTree({
  categories,
  counts,
  search,
  onSearch,
  currentID,
  onCreate,
}: Props) {
  const { deniedReason } = usePermissions()
  const rows = search.trim()
    ? searchCategories(categories, search)
    : flattenCategories(categories)
  const denied = deniedReason("schema.manage")

  return (
    <div className="bg-well grid gap-2.5 rounded-[28px] p-3">
      <Label htmlFor="ct-search" className="sr-only">
        {tMeta.categories.searchHint}
      </Label>
      {/* An Input rather than ListToolbar: that one is built for the strip
          above a table -- full width, room for filter controls -- and putting
          it in a 300px rail brings its assumptions along with it. */}
      <Input
        id="ct-search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
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
        <ul className="grid gap-0.5">
          {rows.map(({ category: c, depth, path }) => (
            <li key={c.id}>
              <Link
                to={`/categories/${c.id}`}
                aria-current={c.id === currentID ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-full py-[9px] pr-3.5 text-sm transition-colors",
                  c.id === currentID
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "hover:bg-accent hover:text-accent-foreground",
                  depth > 0 && c.id !== currentID && "text-muted-foreground",
                )}
                style={{ paddingInlineStart: 14 + depth * 18 }}
              >
                <span className="min-w-0 flex-1 truncate" title={path ?? c.name}>
                  {path ?? c.name}
                </span>
                {/* Zero is written out. A blank where a digit belongs reads as
                    "not loaded", which is a different answer from "none" and
                    the reader cannot tell them apart afterwards. */}
                <span className="shrink-0 text-[13px] tabular-nums">{counts[c.id] ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
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
