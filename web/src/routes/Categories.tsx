import { AlertCircleIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category } from "@/lib/types"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { ListToolbar } from "@/features/common/ListToolbar"
import { useListQuery } from "@/features/common/useListQuery"
import { CategoryTable } from "@/features/categories/CategoryTable"
import { CategoryEditor } from "@/features/categories/CategoryEditor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function Categories() {
  const queryClient = useQueryClient()
  // No paging here: page two of a tree can begin with a child whose parent was
  // on page one, and the indent would then be measured against nothing. See
  // decision 91.
  const listQuery = useListQuery()
  const { deniedReason } = usePermissions()
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

  return (
    <div className="grid gap-5">
      {/* The list is what the page is for; creating a category is occasional,
          so the form waits behind a button. */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{tMeta.categories.title}</h1>
        <Dialog
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next)
            if (!next) resetCreateForm()
          }}
        >
          <DialogTrigger asChild>
            <Button
              className="ml-auto"
              disabled={deniedReason("schema.manage") !== undefined}
              title={deniedReason("schema.manage")}
            >
              <PlusIcon data-icon="inline-start" />
              {tMeta.categories.create}
            </Button>
          </DialogTrigger>
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
                <Select value={toNone(parentId)} onValueChange={(v) => setParentId(fromNone(v))}>
                  <SelectTrigger id="c-parent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NONE}>{tMeta.categories.noParent}</SelectItem>
                      {(categories.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
                {create.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                {tMeta.categories.create}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-muted-foreground text-sm">{tMeta.categories.selectHint}</p>

      <ListToolbar
        q={listQuery.q}
        onQ={listQuery.setQ}
        searchHint={tMeta.categories.searchHint}
      />

      <StateBoundary
        isLoading={categories.isLoading}
        error={categories.error as Error | null}
        isEmpty={categories.data?.length === 0}
        emptyTitle={tMeta.categories.empty}
        emptyHint={tMeta.categories.emptyHint}
      >
        <CategoryTable
          categories={categories.data ?? []}
          search={listQuery.q}
          onOpen={setEditing}
          onCreateChild={(c) => {
            setParentId(c.id)
            setCreateOpen(true)
          }}
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
