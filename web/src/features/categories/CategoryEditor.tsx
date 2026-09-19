import { WarningCircle } from "@phosphor-icons/react"
import { Hint } from "@/features/common/Hint"
import { SearchSelect } from "@/features/common/SearchSelect"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category, CategorySchema } from "@/lib/types"
import { t, tConfig, tMeta } from "@/i18n"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { usePresets, usePrinting } from "@/features/print/usePrinting"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  const bound = schema.data?.fields ?? []
  // Only unique fields are offered as the number: one two devices can share is
  // not an identifier, and the server refuses the rest anyway.
  const numberCandidates = bound.filter((f) => f.is_unique)

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
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {tMeta.categories.editTitle}：{category.name}
          </DialogTitle>
          <DialogDescription className="sr-only">{category.code}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Code beside the name (handoff d04). The code is fixed once made
              -- templates read it -- so it is shown disabled rather than
              hidden, the way the status key is. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ce-code">{tMeta.categories.codeShort}</FieldLabel>
              <Input id="ce-code" className="font-mono text-[13px]" value={category.code} disabled readOnly />
            </Field>
            <Field>
              <FieldLabel htmlFor="ce-name">{tMeta.categories.name}</FieldLabel>
              <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="ce-parent">{tMeta.categories.parent}</FieldLabel>
            {/* Searchable: categories grow without bound. */}
            <SearchSelect
              id="ce-parent"
              value={parentId}
              onChange={setParentId}
              placeholder={tMeta.categories.noParent}
              options={categories
                .filter((c) => c.id !== category.id && !c.path.startsWith(category.path))
                .map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>

          <Field>
            <div className="flex items-center gap-1.5">
              <FieldLabel htmlFor="ce-display-key">{tConfig.displayKey.label}</FieldLabel>
              <Hint>{tConfig.displayKey.hint}</Hint>
            </div>
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
          </Field>

          {/* Only where something can print. The value is opaque here: what a
              preset contains is the print service's business, and an
              installation without one should not be asked about it. */}
          {printing && (
            <FieldSet>
              <div className="mb-3 flex items-center gap-1.5">
                <FieldLegend variant="label" className="mb-0">
                  {tMeta.categories.printPreset}
                </FieldLegend>
                <Hint>{tMeta.categories.printPresetHint}</Hint>
              </div>
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

          {/* No fields table in here any more (030): the pane beside the
              tree lists them, read-only, with the same bindElsewhere hint.
              The dialog is for the four things one PATCH saves. */}

          {/* A refusal has to render in here: the page behind this dialog is
              aria-hidden and covered. */}
          {banner && (
            <Alert variant="destructive">
              <WarningCircle />
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
              <Button variant="ghost" className="text-destructive mr-auto" disabled={remove.isPending}>
                {tMeta.categories.delete}
              </Button>
            }
            title={tMeta.categories.deleteTitle}
            description={tMeta.categories.deleteHint(category.name)}
            confirmLabel={tMeta.categories.delete}
            tone="danger"
            requirePhrase={category.name}
            onConfirm={() => remove.mutate()}
          />
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button onClick={() => save.mutate()} disabled={name === "" || save.isPending}>
            {save.isPending && <Spinner aria-hidden />}
            {tMeta.categories.save}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}
