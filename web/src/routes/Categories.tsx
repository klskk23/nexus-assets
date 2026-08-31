import { AlertCircleIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category, CategorySchema } from "@/lib/types"
import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { CollapsibleTree, buildTree } from "@/features/tree/CollapsibleTree"
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

  // Deleting detaches these rather than refusing on them, so the confirmation
  // has to say which before it happens rather than after.
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  const detaching = (models.data ?? []).filter((m) => (m.category_ids ?? []).includes(selected))

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
    mutationFn: () => api.del(`/categories/${selected}`),
    onSuccess: () => {
      setRemoveBanner(null)
      setRemoveBlockers([])
      setSelected("")
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

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{tMeta.categories.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <StateBoundary
              isLoading={categories.isLoading}
              error={categories.error as Error | null}
              isEmpty={categories.data?.length === 0}
              emptyTitle={tMeta.categories.empty}
              emptyHint={tMeta.categories.emptyHint}
            >
              <CollapsibleTree
                nodes={buildTree(categories.data ?? [])}
                selectedId={selected}
                onSelect={setSelected}
              />
            </StateBoundary>
          </CardContent>
        </Card>

        {selected && (
          <div className="grid gap-6">
            {selectedCategory && (
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-medium">{selectedCategory.name}</h2>
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive" size="sm" className="ml-auto">
                      {tMeta.categories.delete}
                    </Button>
                  }
                  title={tMeta.categories.deleteTitle}
                  description={
                    tMeta.categories.deleteHint(selectedCategory.name) +
                    (detaching.length > 0
                      ? tMeta.categories.deleteDetaches(detaching.map((m) => m.name).join("、"))
                      : "")
                  }
                  confirmLabel={tMeta.categories.delete}
                  requirePhrase={selectedCategory.name}
                  onConfirm={() => remove.mutate()}
                />
              </div>
            )}

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
                <Button
                  className="mb-0.5"
                  onClick={() => bind.mutate()}
                  disabled={bindField === ""}
                >
                  {tMeta.categories.bind}
                </Button>
              </div>

              <ul className="grid gap-2">
                {(schema.data?.fields ?? []).map((f) => (
                  <li key={f.key} aria-label={f.label} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-muted-foreground">{f.key}</span>
                    <span>{f.label}</span>
                    {f.required && <Badge variant="outline">{tMeta.categories.required}</Badge>}
                    {f.inherited_from ? (
                      <Badge variant="secondary">
                        {tMeta.categories.inheritedFrom}
                        {(categories.data ?? []).find((c) => c.id === f.inherited_from)?.name ?? ""}
                      </Badge>
                    ) : (
                      // Unbinding is how a field that assets already carry
                      // values for gets retired -- deleting it would be
                      // refused, and there is no longer an archive to fall
                      // back on. Only bindings made here can be removed here.
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm" className="ml-auto">
                            {tMeta.categories.unbind}
                          </Button>
                        }
                        title={tMeta.categories.unbindTitle}
                        description={tMeta.categories.unbindHint(f.label)}
                        confirmLabel={tMeta.categories.unbind}
                        onConfirm={() => unbind.mutate(f.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </div>
  )
}
