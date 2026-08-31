import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { AssetPage, BoundField, Category, CategorySchema } from "@/lib/types"
import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { t, tConfig, tMeta } from "@/i18n"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Props {
  category: Category
  categories: Category[]
  onClose: () => void
}

/**
 * Everything about one category, in the dialog its row opens.
 *
 * The page used to answer this in a panel beside the tree, which meant the
 * category list was the only table on the product where clicking a row did not
 * open an editor. Name, parent and the number field are one save -- the server
 * takes all three in one PATCH. Binding and unbinding are their own endpoints
 * and take effect as they are pressed, which is why they sit below the save
 * rather than inside it.
 */
export function CategoryEditor({ category, categories, onClose }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(category.name)
  const [parentId, setParentId] = useState(category.parent_id ?? "")
  const [displayKey, setDisplayKey] = useState(category.display_key)
  const [bindField, setBindField] = useState("")
  const [bindRequired, setBindRequired] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [unbinding, setUnbinding] = useState<BoundField | null>(null)

  const schema = useQuery({
    queryKey: ["schema", category.id],
    queryFn: () => api.get<CategorySchema>(`/categories/${category.id}/schema`),
  })
  const fields = useQuery({
    queryKey: ["fields"],
    queryFn: () => api.get<FieldDefinitionRow[]>("/fields"),
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  // How many devices a new required field would land on. Asked for one row
  // because only the total is wanted, and the subtree because a binding made
  // here applies all the way down it.
  const populated = useQuery({
    queryKey: ["category-asset-count", category.id],
    queryFn: () =>
      api.get<AssetPage>(
        `/assets?category_id=${category.id}&include_descendants=true&limit=1`,
      ),
  })
  const existingAssets = populated.data?.total ?? 0

  const bound = schema.data?.fields ?? []
  // Only unique fields are offered as the number: one two devices can share is
  // not an identifier, and the server refuses the rest anyway.
  const numberCandidates = bound.filter((f) => f.is_unique)
  // Deleting detaches these instead of refusing on them, so the confirmation
  // names them beforehand rather than reporting them after.
  const detaching = (models.data ?? []).filter((m) =>
    (m.category_ids ?? []).includes(category.id),
  )

  const fail = (e: unknown) => {
    if (e instanceof ApiError) {
      setBanner(e.message)
      setBlockers(e.blockers ?? [])
    } else {
      setBanner(t.common.error)
    }
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/categories/${category.id}`, {
        name,
        parent_id: parentId || null,
        display_key: displayKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      queryClient.invalidateQueries({ queryKey: ["category-schema", category.id] })
      onClose()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: () => api.del(`/categories/${category.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      onClose()
    },
    onError: fail,
  })

  const bind = useMutation({
    mutationFn: () =>
      api.post(`/categories/${category.id}/bindings`, {
        field_id: bindField,
        required: bindRequired,
      }),
    onSuccess: () => {
      setBanner(null)
      setBlockers([])
      setBindField("")
      queryClient.invalidateQueries({ queryKey: ["schema", category.id] })
    },
    onError: fail,
  })

  const unbind = useMutation({
    mutationFn: (fieldID: string) =>
      api.del(`/categories/${category.id}/bindings/${fieldID}`),
    onSuccess: () => {
      setBanner(null)
      setBlockers([])
      queryClient.invalidateQueries({ queryKey: ["schema", category.id] })
      queryClient.invalidateQueries({ queryKey: ["category-schema", category.id] })
    },
    onError: fail,
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {tMeta.categories.editTitle}：{category.name}
          </DialogTitle>
          <DialogDescription className="font-mono">{category.code}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
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
                  {categories
                    // Neither itself nor anything beneath it: a category cannot
                    // be its own ancestor.
                    .filter((c) => !c.path.startsWith(category.path))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="ce-display-key">{tConfig.displayKey.label}</FieldLabel>
            <Select
              value={toNone(displayKey)}
              onValueChange={(v) => setDisplayKey(fromNone(v))}
            >
              <SelectTrigger id="ce-display-key">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{tConfig.displayKey.none}</SelectItem>
                  {numberCandidates.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}（{f.key}）
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{tConfig.displayKey.hint}</FieldDescription>
          </Field>

          <div className="grid gap-2">
            <p className="text-sm font-medium">{tMeta.categories.fields}</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="w-auto">
                <FieldLabel htmlFor="ce-bind">{tMeta.categories.bind}</FieldLabel>
                <Select value={bindField} onValueChange={setBindField}>
                  <SelectTrigger id="ce-bind" className="w-56">
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
                  id="ce-required"
                  checked={bindRequired}
                  onCheckedChange={(v) => setBindRequired(v === true)}
                />
                <FieldLabel htmlFor="ce-required">{tMeta.categories.required}</FieldLabel>
              </Field>
              <Button
                className="mb-0.5"
                size="sm"
                onClick={() => bind.mutate()}
                disabled={bindField === "" || bind.isPending}
              >
                {tMeta.categories.bind}
              </Button>
            </div>

            {/* Required is checked when an asset is written, not when the
                field is bound, so the devices already recorded keep their gap
                until someone edits one. That is worth saying out loud before
                the box is ticked rather than discovering it on a refusal. */}
            {bindRequired && existingAssets > 0 && (
              <Alert>
                <AlertCircleIcon />
                <AlertDescription>
                  {tMeta.categories.requiredWarning(existingAssets)}
                </AlertDescription>
              </Alert>
            )}

            {/* Unbinding is where every other row action is: the menu. An
                inherited binding was not made here and cannot be removed here,
                so the item is disabled rather than missing. */}
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
                  {bound.map((f) => (
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
                                {categories.find((c) => c.id === f.inherited_from)?.name ?? ""}
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
          </div>

          {/* A refusal has to render in here: the page behind this dialog is
              aria-hidden and covered. */}
          {banner && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription className="grid gap-1">
                {banner}
                {blockers.length > 0 && (
                  <ul className="grid gap-0.5 text-xs">
                    {blockers.map((b) => (
                      <li key={blockerKey(b)}>{b.name}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <ConfirmDialog
            trigger={
              <Button variant="destructive" className="mr-auto" disabled={remove.isPending}>
                {tMeta.categories.delete}
              </Button>
            }
            title={tMeta.categories.deleteTitle}
            description={
              tMeta.categories.deleteHint(category.name) +
              (detaching.length > 0
                ? tMeta.categories.deleteDetaches(detaching.map((m) => m.name).join("、"))
                : "")
            }
            confirmLabel={tMeta.categories.delete}
            requirePhrase={category.name}
            onConfirm={() => remove.mutate()}
          />
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button onClick={() => save.mutate()} disabled={name === "" || save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {tMeta.categories.save}
          </Button>
        </DialogFooter>

        <ConfirmDialog
          open={unbinding !== null}
          onOpenChange={(next) => !next && setUnbinding(null)}
          title={tMeta.categories.unbindTitle}
          description={unbinding ? tMeta.categories.unbindHint(unbinding.label) : ""}
          confirmLabel={tMeta.categories.unbind}
          onConfirm={() => unbinding && unbind.mutate(unbinding.id)}
        />
      </DialogContent>
    </Dialog>
  )
}
