import { WarningCircle } from "@phosphor-icons/react"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, ApiError, blockerKey, type Blocker, type FieldErrors } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category, CategoryDraft, CategoryPreview } from "@/lib/types"
import { t, tConfig, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Hint } from "@/features/common/Hint"
import { SearchSelect } from "@/features/common/SearchSelect"
import { useComposedInput } from "@/features/common/useComposedInput"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { usePresets, usePrinting } from "@/features/print/usePrinting"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { InheritanceConfirmation } from "./InheritanceConfirmation"
import { CategoryInheritance } from "./CategoryInheritance"
import { useCategoryDraft } from "./useCategoryDraft"

interface Props {
  category?: Category
  categories: Category[]
  onClose: () => void
}

/** Creation and editing use the same complete draft and the same preview rules. */
export function CategoryEditor({ category, categories, onClose }: Props) {
  const state = useCategoryDraft(category)
  const { draft, change: changeDraft } = state
  const [confirmation, setConfirmation] = useState<{ draft: CategoryDraft; preview: CategoryPreview }>()
  const [stale, setStale] = useState(false)
  const change = (values: Partial<CategoryDraft>) => { setConfirmation(undefined); changeDraft(values) }
  const { deniedReason } = usePermissions()
  const denied = deniedReason("schema.manage")
  const { enabled: printing, url: printerURL } = usePrinting()
  const presets = usePresets(printing)
  const [banner, setBanner] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const codeInput = useComposedInput(draft.code ?? category?.code ?? "", (code) => change({ code }))
  const nameInput = useComposedInput(draft.name, (name) => change({ name }))
  const previewErrors = state.error instanceof ApiError ? state.error.fields : undefined
  const displayIssue = state.ready ? state.preview?.issues.items.find((issue) => issue.code === "display_key_unbound" && issue.category_id === (category?.id ?? state.preview?.category.id)) : undefined
  const errors: FieldErrors = { ...fieldErrors, ...previewErrors, ...(displayIssue ? { display_key: displayIssue.message } : {}) }
  const fail = (error: unknown) => {
    const message = error instanceof ApiError ? error.message : t.common.error
    setBanner(message)
    setBlockers(error instanceof ApiError ? error.blockers ?? [] : [])
    setFieldErrors(error instanceof ApiError ? error.fields ?? {} : {})
    if (error instanceof ApiError && ["impact_stale", "confirmation_required"].includes(error.code)) {
      setConfirmation(undefined)
      setStale(true)
    }
    toast.error(message)
  }
  const save = useMutation({
    mutationFn: (body: CategoryDraft & { confirmation_token?: string }) => category ? api.patch(`/categories/${category.id}`, body) : api.post("/categories", body),
    onSuccess: async () => { await state.invalidate(); toast.success(tMeta.categories.inheritance.saved); onClose() },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: () => api.del(`/categories/${category!.id}`),
    onSuccess: async () => { await state.invalidate(); toast.success(tMeta.categories.inheritance.deleted); onClose() },
    onError: fail,
  })
  const pending = save.isPending || remove.isPending
  const disabled = !!denied || pending || !!confirmation
  const togglePreset = (id: string) => change({ print_preset_ids: draft.print_preset_ids.includes(id) ? draft.print_preset_ids.filter((value) => value !== id) : [...draft.print_preset_ids, id] })
  const title = category ? `${tMeta.categories.editTitle}：${category.name}` : tMeta.categories.create
  return <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
    <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-[480px]">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">{tMeta.categories.inheritance.hint}</DialogDescription></DialogHeader>
      <FieldGroup className="gap-4">
        {denied && <Alert><AlertDescription>{denied}</AlertDescription></Alert>}
        <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
          <Field data-invalid={!!errors.code}>
            <FieldLabel htmlFor="ce-code">{category ? tMeta.categories.codeShort : tMeta.categories.code}</FieldLabel>
            <Input id="ce-code" className="font-mono text-[13px]" {...codeInput} disabled={!!category || disabled} aria-invalid={!!errors.code} />
            {errors.code && <FieldError>{errors.code}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="ce-name">{tMeta.categories.name}</FieldLabel>
            <Input id="ce-name" {...nameInput} disabled={disabled} aria-invalid={!!errors.name} />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
        </FieldGroup>
        <Field data-invalid={!!errors.parent_id}>
          <FieldLabel htmlFor="ce-parent">{tMeta.categories.parent}</FieldLabel>
          <SearchSelect id="ce-parent" value={draft.parent_id ?? ""} disabled={disabled || draft.inherited_field_ids === undefined} onChange={(parent) => change({ parent_id: parent || null })} placeholder={tMeta.categories.noParent}
            options={categories.filter((c) => !category || (c.id !== category.id && !c.path.startsWith(category.path))).map((c) => ({ value: c.id, label: c.name }))} />
          {errors.parent_id && <FieldError>{errors.parent_id}</FieldError>}
        </Field>
        <CategoryInheritance state={state} categories={categories} disabled={disabled} fieldError={errors.inherited_field_ids} />
        <Field data-invalid={!!errors.display_key}>
          <div className="flex items-center gap-1.5"><FieldLabel htmlFor="ce-display-key">{tConfig.displayKey.label}</FieldLabel><Hint>{tConfig.displayKey.hint}</Hint></div>
          <Select value={toNone(draft.display_key)} disabled={disabled || !state.ready} onValueChange={(value) => change({ display_key: fromNone(value) })}>
            <SelectTrigger id="ce-display-key" aria-invalid={!!errors.display_key}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value={NONE}>{tConfig.displayKey.none}</SelectItem>
              {(state.preview?.fields ?? []).map((field) => <SelectItem key={field.id} value={field.key}>{field.label}（{field.key}）</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          {errors.display_key && <FieldError>{errors.display_key}</FieldError>}
        </Field>
        {printing && <FieldSet>
          <div className="mb-3 flex items-center gap-1.5"><FieldLegend variant="label" className="mb-0">{tMeta.categories.printPreset}</FieldLegend><Hint>{tMeta.categories.printPresetHint}</Hint></div>
          <FieldGroup className="gap-2">
            {(presets.data?.presets ?? []).map((preset) => <Field key={preset.id} orientation="horizontal" className="w-auto"><Checkbox id={`preset-${preset.id}`} disabled={disabled} checked={draft.print_preset_ids.includes(preset.id)} onCheckedChange={() => togglePreset(preset.id)} /><FieldLabel htmlFor={`preset-${preset.id}`}>{preset.name}</FieldLabel></Field>)}
            {draft.print_preset_ids.filter((id) => !(presets.data?.presets ?? []).some((p) => p.id === id)).map((id) => <Field key={id} orientation="horizontal" className="w-auto"><Checkbox id={`preset-${id}`} checked disabled={disabled} onCheckedChange={() => togglePreset(id)} /><FieldLabel htmlFor={`preset-${id}`} className="font-mono">{id}</FieldLabel></Field>)}
          </FieldGroup>
          {errors.print_preset_ids && <FieldError>{errors.print_preset_ids}</FieldError>}
          {presets.isError && <FieldDescription>{tMeta.categories.printPresetOffline}</FieldDescription>}
          {printerURL !== "" && <FieldDescription><a href={`${printerURL}/print-presets`} target="_blank" rel="noreferrer" className="underline underline-offset-4">{tMeta.categories.printPresetManage}</a></FieldDescription>}
        </FieldSet>}
        {stale && <Button variant="outline" onClick={() => { setStale(false); setBanner(null); state.retry() }}>{tMeta.categories.inheritance.refresh}</Button>}
        {banner && <Alert variant="destructive"><WarningCircle /><AlertDescription className="grid gap-1">{banner}{blockers.length > 0 && <ul className="grid gap-0.5 text-xs">{blockers.map((b) => <li key={blockerKey(b)}>{b.name}</li>)}</ul>}</AlertDescription></Alert>}
      </FieldGroup>
      <DialogFooter>
        {category && <ConfirmDialog trigger={<Button variant="ghost" className="text-destructive mr-auto" disabled={disabled}>{tMeta.categories.delete}</Button>} title={tMeta.categories.deleteTitle} description={tMeta.categories.deleteHint(category.name)} confirmLabel={tMeta.categories.delete} tone="danger" requirePhrase={category.name} onConfirm={() => remove.mutate()} />}
        <DialogClose asChild><Button variant="ghost" disabled={pending || !!confirmation}>{t.common.cancel}</Button></DialogClose>
        <Button disabled={disabled || stale || !state.canSave || !draft.name.trim() || (!category && !draft.code?.trim())} onClick={() => { if (state.canSave && !disabled && !stale) { if (state.preview?.requires_confirmation) setConfirmation({ draft: structuredClone(draft), preview: state.preview }); else save.mutate(draft) } }}>
          {save.isPending && <Spinner aria-hidden />}{category ? tMeta.categories.save : tMeta.categories.create}
        </Button>
      </DialogFooter>
      {confirmation && <InheritanceConfirmation initial={confirmation.preview} categories={categories}
        load={(params) => api.post<CategoryPreview>(`${category ? `/categories/${category.id}` : "/categories"}/preview?${params}`, confirmation.draft)}
        onConfirm={(token) => save.mutateAsync({ ...confirmation.draft, confirmation_token: token })}
        onCancel={() => setConfirmation(undefined)} confirmLabel={tMeta.categories.inheritance.confirmSave} />}
    </DialogContent>
  </Dialog>
}
