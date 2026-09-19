import { WarningCircle } from "@phosphor-icons/react"
import { useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Category } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
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
  const { deniedReason } = usePermissions()
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
  const denied = deniedReason("schema.manage")

  return (
    <div className="grid gap-[22px]">
      {/* The trigger is a page action in the header (030, handoff §4 --
          "新建类别" at the row's end as the primary verb). 024 had put it at
          the foot of the tree; the prototype puts every page's creating verb
          in the same place, and a reader who has learned one page has
          learned them all. Still a category, not a child of whatever is
          selected: the parent is a field on the form. */}
      <PageHeader title={tMeta.categories.title} hint={tMeta.categories.selectHint}>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={Boolean(denied)}
          title={denied ?? undefined}
        >
          {tMeta.categories.create}
        </Button>
      </PageHeader>

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
                <WarningCircle />
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
