import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category, CategorySchema } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { t, tConfig, tMeta } from "@/i18n"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { usePresets, usePrinting } from "@/features/print/usePrinting"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
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
  const { enabled: printing, url: printerURL } = usePrinting()
  const presets = usePresets(printing)
  const [name, setName] = useState(category.name)
  const [parentId, setParentId] = useState(category.parent_id ?? "")
  const [displayKey, setDisplayKey] = useState(category.display_key)
  const [presetIDs, setPresetIDs] = useState<string[]>(category.print_preset_ids ?? [])
  const [banner, setBanner] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<Blocker[]>([])

  const schema = useQuery({
    queryKey: ["schema", category.id],
    queryFn: () => api.get<CategorySchema>(`/categories/${category.id}/schema`),
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })

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
        ...(printing ? { print_preset_ids: presetIDs } : {}),
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

          {/* Only where something can print. The value is opaque here: what a
              preset contains is the print service's business, and an
              installation without one should not be asked about it. */}
          {printing && (
            <FieldSet>
              <FieldLegend variant="label">{tMeta.categories.printPreset}</FieldLegend>
              <FieldDescription>{tMeta.categories.printPresetHint}</FieldDescription>
              <FieldGroup className="gap-2">
                {(presets.data?.presets ?? []).map((p) => (
                  <Field key={p.id} orientation="horizontal" className="w-auto">
                    <Checkbox
                      id={`preset-${p.id}`}
                      checked={presetIDs.includes(p.id)}
                      onCheckedChange={() =>
                        setPresetIDs((cur) =>
                          cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id],
                        )
                      }
                    />
                    <FieldLabel htmlFor={`preset-${p.id}`}>{p.name}</FieldLabel>
                  </Field>
                ))}
                {/* Chosen before it was renamed or removed, and still what this
                    category points at: hiding it would silently unbind it. */}
                {presetIDs
                  .filter((id) => !(presets.data?.presets ?? []).some((p) => p.id === id))
                  .map((id) => (
                    <Field key={id} orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`preset-${id}`}
                        checked
                        onCheckedChange={() =>
                          setPresetIDs((cur) => cur.filter((x) => x !== id))
                        }
                      />
                      <FieldLabel htmlFor={`preset-${id}`} className="font-mono">
                        {id}
                      </FieldLabel>
                    </Field>
                  ))}
              </FieldGroup>
              {presets.isError && (
                <FieldDescription>{tMeta.categories.printPresetOffline}</FieldDescription>
              )}
              {/* Labels are designed over there; this is the way across. */}
              {printerURL !== "" && (
                <FieldDescription>
                  <a
                    href={`${printerURL}/print-presets`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    {tMeta.categories.printPresetManage}
                  </a>
                </FieldDescription>
              )}
            </FieldSet>
          )}

          <div className="grid gap-2">
            <p className="text-sm font-medium">{tMeta.categories.fields}</p>
            {/* Read-only: a field is bound to categories from the field
                itself, which is where the question "where does this belong"
                actually gets answered. */}
            <p className="text-muted-foreground text-sm">{tMeta.categories.bindElsewhere}</p>

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
                    <TableRow key={f.key} aria-label={f.label}>
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

      </DialogContent>
    </Dialog>
  )
}
