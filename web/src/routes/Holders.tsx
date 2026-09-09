import { useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { HolderEntity } from "@/lib/types"
import { tMeta } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { PageHeader } from "@/features/common/PageHeader"
import { MasterDetail } from "@/features/common/MasterDetail"
import { useMasterSelection } from "@/features/common/useMasterSelection"
import { HolderTree } from "@/features/holders/HolderTree"
import { HolderDetail } from "@/features/holders/HolderDetail"
import { HolderEditor } from "@/features/holders/HolderEditor"
import { HolderCreateDialog } from "@/features/holders/HolderCreateDialog"
import { refusalOf, type Refusal } from "@/features/holders/RefusalAlert"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/**
 * Holders as the tree they are, beside what each one is.
 *
 * The fourth page to leave the table behind, and the one that needed it most:
 * a department must hang from a company and a location may hang from either,
 * so 上级 as a column meant reading the shape of the organisation by
 * assembling rows in your head.
 */
export function Holders() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  // The search term lives in the address, as it does on the three other
  // rails: replace rather than push, because a filter is not a place you went.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get("q") ?? ""
  const setSearch = (q: string) => {
    const next = new URLSearchParams(searchParams)
    if (q) next.set("q", q)
    else next.delete("q")
    setSearchParams(next, { replace: true })
  }
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<HolderEntity | null>(null)
  const [stockRefusal, setStockRefusal] = useState<Refusal | null>(null)

  const all = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
  })
  /**
   * How many devices are standing at each holder, subtree included.
   *
   * One request for the whole page. It replaced a per-holder usage call --
   * twenty holders meant twenty requests, made at load so that a delete
   * confirmation could be ready before anybody reached for it.
   */
  const counts = useQuery({
    queryKey: ["holder-counts"],
    queryFn: () => api.get<Record<string, number>>("/holders/counts"),
  })

  const holders = all.data ?? []
  const selection = useMasterSelection(
    // Every holder, not the ones on the current page: a selection that pages
    // out of view is still a selection, and passing the page would have the
    // pane declare it missing (025).
    holders.map((h) => h.id),
    id,
  )
  const current = holders.find((h) => h.id === selection.current) ?? null
  const defaultStock = holders.find((h) => h.is_default_stock) ?? null

  const setDefaultStock = useMutation({
    mutationFn: (holderID: string) =>
      api.patch(`/holders/${holderID}`, { is_default_stock: true }),
    onSuccess: () => {
      setStockRefusal(null)
      queryClient.invalidateQueries({ queryKey: ["holders"] })
    },
    // The server refuses this for reasons the client cannot know in advance --
    // devices still referencing the current one, for instance. Swallowing it
    // would leave a button that looks like it worked.
    onError: (e) => setStockRefusal(refusalOf(e)),
  })

  return (
    <div>
      <PageHeader title={tMeta.holders.title} hint={tMeta.holders.selectHint}>
        {/* There is exactly one default stock point in the system, and after
            paging arrived it can be on any page -- so the answer is written
            out rather than left to be found. A link into the rail, not a
            control: it moves the selection, which is what clicking a name
            does everywhere else on this page. */}
        {defaultStock ? (
          <Link
            to={`/holders/${defaultStock.id}`}
            className="text-muted-foreground hover:text-primary text-sm"
          >
            {tMeta.holders.defaultStockIs(defaultStock.name)}
          </Link>
        ) : (
          <span className="text-muted-foreground text-sm">{tMeta.holders.defaultStockNone}</span>
        )}
      </PageHeader>

      {creating && (
        <HolderCreateDialog holders={holders} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <HolderEditor
          key={editing.id}
          holder={editing}
          holders={holders}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mt-14">
        <StateBoundary
          isLoading={all.isLoading}
          error={all.error as Error | null}
          onRetry={() => all.refetch()}
        >
          <MasterDetail
            selected={Boolean(id)}
            list={
              <HolderTree
                holders={holders}
                counts={counts.data ?? {}}
                search={search}
                onSearch={setSearch}
                currentID={selection.current}
                onCreate={() => setCreating(true)}
              />
            }
            detail={
              // Nothing at all when there are no holders: the rail already
              // says so and offers the way out, and a second copy of the same
              // sentence beside it is the page saying it twice.
              holders.length === 0 ? null : current ? (
                <HolderDetail
                  key={current.id}
                  holder={current}
                  holders={holders}
                  count={counts.data?.[current.id] ?? 0}
                  onEdit={() => setEditing(current)}
                  onSetDefaultStock={() => {
                    setStockRefusal(null)
                    setDefaultStock.mutate(current.id)
                  }}
                  settingDefaultStock={setDefaultStock.isPending}
                  stockRefusal={stockRefusal}
                />
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {selection.missing ? tMeta.holders.notFound : tMeta.holders.empty}
                    </EmptyTitle>
                    <EmptyDescription>
                      {selection.missing
                        ? tMeta.holders.notFoundHint
                        : tMeta.holders.emptyHint}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            }
          />
        </StateBoundary>
      </div>
    </div>
  )
}
