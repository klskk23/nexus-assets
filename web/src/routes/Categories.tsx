import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Category } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { PageHeader } from "@/features/common/PageHeader"
import { MasterDetail } from "@/features/common/MasterDetail"
import { SearchSelect } from "@/features/common/SearchSelect"
import { useMasterSelection } from "@/features/common/useMasterSelection"
import { CategoryTree } from "@/features/categories/CategoryTree"
import { CategoryDetail } from "@/features/categories/CategoryDetail"
import { CategoryEditor } from "@/features/categories/CategoryEditor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"

export function Categories() {
  const queryClient = useQueryClient()
  // No paging here: page two of a tree can begin with a child whose parent was
  // on page one, and the indent would then be measured against nothing. See
  // decision 91.
  const { id } = useParams()
  // The search term stays in the address, the way it did when useListQuery was
  // doing it as a side effect. Dropping to useState here would have lost that
  // silently -- nothing would fail, the term would simply stop surviving a
  // refresh or a paste. replace, not push: a filter is not a place you went.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get("q") ?? ""
  const setSearch = (q: string) => {
    const next = new URLSearchParams(searchParams)
    if (q) next.set("q", q)
    else next.delete("q")
    setSearchParams(next, { replace: true })
  }
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  // The row a menu action is aimed at. The menu closes as it fires, so the
  // dialog it opens is rendered outside it and told which row it is on.
  const [editing, setEditing] = useState<Category | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  // The same map the overview reads -- one system, one answer to "how many of
  // these do we have".
  const counts = useQuery({
    queryKey: ["category-counts"],
    queryFn: () => api.get<Record<string, number>>("/categories/counts"),
  })

  const create = useMutation({
    mutationFn: () => api.post("/categories", { code, name, parent_id: parentId || null }),
    onSuccess: () => {
      setCreateOpen(false)
      resetCreateForm()
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
  })

  const resetCreateForm = () => {
    setCode("")
    setName("")
    setParentId("")
    create.reset()
  }

  const items = categories.data ?? []
  const selection = useMasterSelection(
    items.map((c) => c.id),
    id,
  )
  const current = items.find((c) => c.id === selection.current) ?? null


  return (
    <div>
      <PageHeader title={tMeta.categories.title} hint={tMeta.categories.selectHint} />

      {/* The trigger lives at the foot of the tree, not up here: creating a
          category is something you do while looking at the ones that exist,
          and the page header is where a *page* action goes. Controlled from
          there rather than wrapped around it, so the button stays part of the
          list it belongs to. */}
      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next)
          if (!next) resetCreateForm()
        }}
      >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tMeta.categories.create}</DialogTitle>
            </DialogHeader>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="c-code">{tMeta.categories.code}</FieldLabel>
                <Input id="c-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-name">{tMeta.categories.name}</FieldLabel>
                <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-parent">{tMeta.categories.parent}</FieldLabel>
                {/* Searchable: categories grow without bound. */}
                <SearchSelect
                  id="c-parent"
                  value={parentId}
                  onChange={setParentId}
                  placeholder={tMeta.categories.noParent}
                  options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
            </FieldGroup>

            {create.error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>
                  {create.error instanceof ApiError ? create.error.message : t.common.error}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t.common.cancel}</Button>
              </DialogClose>
              <Button
                onClick={() => create.mutate()}
                disabled={code === "" || name === "" || create.isPending}
              >
                {create.isPending && <Spinner aria-hidden />}
                {tMeta.categories.create}
              </Button>
            </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* 56px below the title. The two panes state their own inner gap. */}
      <div className="mt-14">
        <StateBoundary
          isLoading={categories.isLoading}
          error={categories.error as Error | null}
          onRetry={() => categories.refetch()}
        >
          <MasterDetail
            selected={Boolean(id)}
            list={
              <CategoryTree
                categories={items}
                counts={counts.data ?? {}}
                search={search}
                onSearch={setSearch}
                currentID={selection.current}
                onCreate={() => setCreateOpen(true)}
              />
            }
            detail={
              // Nothing at all when there are no categories: the rail already
              // says so and offers the way out, and a second copy of the same
              // sentence beside it is the page saying it twice.
              items.length === 0 ? null : current ? (
                <CategoryDetail
                  key={current.id}
                  category={current}
                  categories={items}
                  count={counts.data?.[current.id] ?? 0}
                  onEdit={() => setEditing(current)}
                />
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {selection.missing
                        ? tMeta.categories.notFound
                        : tMeta.categories.empty}
                    </EmptyTitle>
                    <EmptyDescription>
                      {selection.missing
                        ? tMeta.categories.notFoundHint
                        : tMeta.categories.emptyHint}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            }
          />
        </StateBoundary>
      </div>

      {editing && (
        <CategoryEditor
          key={editing.id}
          category={editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
