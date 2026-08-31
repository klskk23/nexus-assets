import { AlertCircleIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { BoundField, Category, CategorySchema } from "@/lib/types"
import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { CategoryTable } from "@/features/categories/CategoryTable"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { DisplayKeyEditor } from "@/features/categories/DisplayKeyEditor"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
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
  const [selected, setSelected] = useState<string>("")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState("")
  const [bindField, setBindField] = useState("")
  const [bindRequired, setBindRequired] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [removeBanner, setRemoveBanner] = useState<string | null>(null)
  const [removeBlockers, setRemoveBlockers] = useState<Blocker[]>([])
  // The row a menu action is aimed at. The menu closes as it fires, so the
  // dialog it opens has to be rendered outside it and told which row it is on.
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [unbinding, setUnbinding] = useState<BoundField | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const fields = useQuery({
    queryKey: ["fields"],
    queryFn: () => api.get<FieldDefinitionRow[]>("/fields"),
  })
  const schema = useQuery({
    queryKey: ["schema", selected],
    queryFn: () => api.get<CategorySchema>(`/categories/${selected}/schema`),
    enabled: selected !== "",
  })

  const unbind = useMutation({
    mutationFn: (fieldID: string) =>
      api.del(`/categories/${selected}/bindings/${fieldID}`),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["schema", selected] })
      queryClient.invalidateQueries({ queryKey: ["category-schema", selected] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const selectedCategory = (categories.data ?? []).find((c) => c.id === selected)

  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  // Deleting detaches these rather than refusing on them, so the confirmation
  // names them before it happens rather than after.
  const detachedBy = (categoryID: string) =>
    (models.data ?? []).filter((m) => (m.category_ids ?? []).includes(categoryID))

  const create = useMutation({
    mutationFn: () =>
      api.post("/categories", {
        code,
        name,
        parent_id: parentId || null,
      }),
    onSuccess: () => {
      setCreateOpen(false)
      resetCreateForm()
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/categories/${id}`),
    onSuccess: (_data, id) => {
      setRemoveBanner(null)
      setRemoveBlockers([])
      if (id === selected) setSelected("")
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
    // The refusal carries the children, assets or models holding it -- without
    // them "cannot delete" leaves the user with nowhere to look.
    onError: (e) => {
      if (e instanceof ApiError) {
        setRemoveBanner(e.message)
        setRemoveBlockers(e.blockers ?? [])
      } else {
        setRemoveBanner(t.common.error)
      }
    },
  })

  const resetCreateForm = () => {
    setCode("")
    setName("")
    setParentId("")
    create.reset()
  }

  const update = useMutation({
    mutationFn: (patch: { name?: string; parent_id?: string | null }) =>
      api.patch(`/categories/${editing?.id}`, patch),
    onSuccess: () => {
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const bind = useMutation({
    mutationFn: () =>
      api.post(`/categories/${selected}/bindings`, { field_id: bindField, required: bindRequired }),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["schema", selected] })
    },
    // A key already bound higher on the chain is refused; the message names it.
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <div className="grid gap-6">
      {/* The tree and its bindings are what this page is for; creating a
          category is occasional, so the form waits behind a button. */}
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
            <Button className="ml-auto">
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

      {/* Binding and unbinding happen in the panel below, so their failures
          stay out here where those actions are. */}
      {banner && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground text-sm">{tMeta.categories.selectHint}</p>

      <StateBoundary
        isLoading={categories.isLoading}
        error={categories.error as Error | null}
        isEmpty={categories.data?.length === 0}
        emptyTitle={tMeta.categories.empty}
        emptyHint={tMeta.categories.emptyHint}
      >
        <CategoryTable
          categories={categories.data ?? []}
          selectedId={selected}
          onSelect={setSelected}
          onCreateChild={(c) => {
            setParentId(c.id)
            setCreateOpen(true)
          }}
          onEdit={(c) => {
            setName(c.name)
            setParentId(c.parent_id ?? "")
            setEditing(c)
          }}
          onDelete={(c) => setDeleting(c)}
        />
      </StateBoundary>

      {(removeBanner || removeBlockers.length > 0) && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription className="grid gap-1">
            {removeBanner}
            {removeBlockers.length > 0 && (
              <ul className="grid gap-0.5 text-xs">
                {removeBlockers.map((b) => (
                  <li key={blockerKey(b)}>{b.name}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {selected && selectedCategory && (
        <div className="grid gap-6">
          <h2 className="text-lg font-medium">{selectedCategory.name}</h2>

          {schema.data && (
            <DisplayKeyEditor
              key={selected}
              categoryID={selected}
              displayKey={schema.data.category.display_key}
              fields={schema.data.fields}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>{tMeta.categories.fields}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field>
                  <FieldLabel htmlFor="c-bind">{tMeta.categories.bind}</FieldLabel>
                  <Select value={bindField} onValueChange={setBindField}>
                    <SelectTrigger id="c-bind" className="w-56">
                      <SelectValue placeholder={t.common.select} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(fields.data ?? []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field orientation="horizontal" className="w-auto pb-2">
                  <Checkbox
                    id="c-required"
                    checked={bindRequired}
                    onCheckedChange={(v) => setBindRequired(v === true)}
                  />
                  <FieldLabel htmlFor="c-required">{tMeta.categories.required}</FieldLabel>
                </Field>
                <Button className="mb-0.5" onClick={() => bind.mutate()} disabled={bindField === ""}>
                  {tMeta.categories.bind}
                </Button>
              </div>

              {/* The same table shape as everything else, so unbinding is
                  where every other row action is: the menu. An inherited
                  binding was not made here and cannot be removed here, so the
                  item is disabled rather than missing. */}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tMeta.fields.key}</TableHead>
                      <TableHead>{tMeta.fields.label}</TableHead>
                      <TableHead>{tMeta.categories.required}</TableHead>
                      <TableHead>{tMeta.categories.inheritedFrom}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(schema.data?.fields ?? []).map((f) => (
                      <ContextMenu key={f.key}>
                        <ContextMenuTrigger asChild>
                          <TableRow aria-label={f.label}>
                            <TableCell className="text-muted-foreground font-mono">
                              {f.key}
                            </TableCell>
                            <TableCell>{f.label}</TableCell>
                            <TableCell>
                              {f.required && (
                                <Badge variant="outline">{tMeta.categories.required}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {f.inherited_from && (
                                <Badge variant="secondary">
                                  {(categories.data ?? []).find((c) => c.id === f.inherited_from)
                                    ?.name ?? ""}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            variant="destructive"
                            disabled={Boolean(f.inherited_from)}
                            onSelect={() => setUnbinding(f)}
                          >
                            {tMeta.categories.unbind}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rendered outside the menus that open them: a context menu closes as
          it fires, taking any dialog nested inside it with it. */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={tMeta.categories.deleteTitle}
        description={
          deleting
            ? tMeta.categories.deleteHint(deleting.name) +
              (detachedBy(deleting.id).length > 0
                ? tMeta.categories.deleteDetaches(
                    detachedBy(deleting.id)
                      .map((m) => m.name)
                      .join("、"),
                  )
                : "")
            : ""
        }
        confirmLabel={tMeta.categories.delete}
        requirePhrase={deleting?.name}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />

      <ConfirmDialog
        open={unbinding !== null}
        onOpenChange={(next) => !next && setUnbinding(null)}
        title={tMeta.categories.unbindTitle}
        description={unbinding ? tMeta.categories.unbindHint(unbinding.label) : ""}
        confirmLabel={tMeta.categories.unbind}
        onConfirm={() => unbinding && unbind.mutate(unbinding.id)}
      />

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tMeta.categories.editTitle}</DialogTitle>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ce-name">{tMeta.categories.name}</FieldLabel>
              <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ce-parent">{tMeta.categories.parent}</FieldLabel>
              <Select value={toNone(parentId)} onValueChange={(v) => setParentId(fromNone(v))}>
                <SelectTrigger id="ce-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NONE}>{tMeta.categories.noParent}</SelectItem>
                    {(categories.data ?? [])
                      // Neither itself nor anything beneath it: a category
                      // cannot be its own ancestor.
                      .filter(
                        (c) => editing !== null && !c.path.startsWith(editing.path),
                      )
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t.common.cancel}</Button>
            </DialogClose>
            <Button
              onClick={() => update.mutate({ name, parent_id: parentId || null })}
              disabled={name === "" || update.isPending}
            >
              {update.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {tMeta.categories.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
