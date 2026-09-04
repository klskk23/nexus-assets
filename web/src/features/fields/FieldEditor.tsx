import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker, type Referrer } from "@/lib/api"
import type { AssetPage, Category, Conflict, RecomputeReport } from "@/lib/types"
import type { FieldOptions } from "@/lib/types"
import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { t, tConfig, tMeta } from "@/i18n"
import { TableFrame } from "@/features/common/TableFrame"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { ExpressionHelp } from "@/features/fields/ExpressionHelp"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

interface Props {
  field: FieldDefinitionRow
  onClose: () => void
}

/**
 * Edits one field's per-type configuration.
 *
 * Which controls appear is decided by the field's type, mirroring the options
 * contract the server validates against, so an impossible combination cannot be
 * built in the first place.
 */
export function FieldEditor({ field, onClose }: Props) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState(field.label)
  const [options, setOptions] = useState<FieldOptions>(field.options ?? {})
  const [banner, setBanner] = useState<string | null>(null)
  // Two kinds of thing can stand in the way, and the user does something
  // different about each: configuration is edited, data is unbound instead.
  const [refBlockers, setRefBlockers] = useState<Referrer[]>([])
  const [assetBlockers, setAssetBlockers] = useState<Blocker[]>([])
  // Collisions the new rule would cause. Shown here because this is where the
  // rule was changed, and the change has already been undone by the time they
  // appear.
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [confirming, setConfirming] = useState(false)
  // A field is bound to categories, not the other way round: this is where it
  // is decided. Held locally so the dialog reflects a binding immediately.
  const [bound, setBound] = useState<string[]>(field.category_ids ?? [])
  // The other kind of binding (015, decision 96). A field hangs on categories
  // or on models, never both, so the mode is a choice made once -- and it is
  // frozen while either kind of binding exists, because switching would mean
  // silently dropping what is already there.
  const [boundModels, setBoundModels] = useState<string[]>(field.model_ids ?? [])
  const [mode, setMode] = useState<"category" | "model">(
    (field.model_ids ?? []).length > 0 ? "model" : "category",
  )
  const [bindTo, setBindTo] = useState("")
  const [bindRequired, setBindRequired] = useState(false)
  const [unbinding, setUnbinding] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  // How many devices a new required binding would land on. Required is checked
  // when an asset is written, so the answer is a promise about their next edit.
  const populated = useQuery({
    queryKey: ["category-asset-count", bindTo],
    queryFn: () =>
      api.get<AssetPage>(`/assets?category_id=${bindTo}&include_descendants=true&limit=1`),
    enabled: bindTo !== "",
  })

  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
    enabled: mode === "model",
  })
  // What a required model binding would eventually ask for: this model's
  // devices, and only those.
  const modelPopulated = useQuery({
    queryKey: ["model-required-impact", bindTo],
    queryFn: () => api.get<{ total: number }>(`/models/${bindTo}/required-impact`),
    enabled: mode === "model" && bindTo !== "",
  })

  const bindModel = useMutation({
    mutationFn: () =>
      api.post(`/models/${bindTo}/bindings`, { field_id: field.id, required: bindRequired }),
    onSuccess: () => {
      setBanner(null)
      setBoundModels((cur) => (cur.includes(bindTo) ? cur : [...cur, bindTo]))
      setBindTo("")
      setBindRequired(false)
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      queryClient.invalidateQueries({ queryKey: ["schema"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const unbindModel = useMutation({
    mutationFn: (modelID: string) => api.del(`/models/${modelID}/bindings/${field.id}`),
    onSuccess: (_data, modelID) => {
      setBanner(null)
      setBoundModels((cur) => cur.filter((id) => id !== modelID))
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      queryClient.invalidateQueries({ queryKey: ["schema"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const bind = useMutation({
    mutationFn: () =>
      api.post(`/categories/${bindTo}/bindings`, {
        field_id: field.id,
        required: bindRequired,
      }),
    onSuccess: () => {
      setBanner(null)
      setBound((cur) => (cur.includes(bindTo) ? cur : [...cur, bindTo]))
      setBindTo("")
      setBindRequired(false)
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      queryClient.invalidateQueries({ queryKey: ["schema"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const unbind = useMutation({
    mutationFn: (categoryID: string) => api.del(`/categories/${categoryID}/bindings/${field.id}`),
    onSuccess: (_data, categoryID) => {
      setBanner(null)
      setBound((cur) => cur.filter((id) => id !== categoryID))
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      queryClient.invalidateQueries({ queryKey: ["schema"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const referrers = useQuery({
    queryKey: ["referrers", field.id],
    queryFn: () => api.get<Referrer[]>(`/fields/${field.id}/referrers`),
  })

  const set = (patch: Partial<FieldOptions>) => setOptions((o) => ({ ...o, ...patch }))

  // Whether saving would leave stored values disagreeing with the rule that
  // produced them. Only a changed expression can do that; renaming the field
  // cannot.
  const ruleChanged =
    field.type === "computed" && (options.template ?? "") !== (field.options?.template ?? "")

  const save = useMutation({
    mutationFn: async (): Promise<RecomputeReport | null> => {
      await api.patch(`/fields/${field.id}`, { label, options })
      if (!ruleChanged) return null

      const report = await api.post<RecomputeReport>(
        `/fields/${field.id}/recompute?dry_run=false`,
        {},
      )
      if ((report.conflicts ?? []).length > 0) {
        // Put the rule back. New devices numbered by the new rule while the
        // old ones keep the old is exactly the split this flow exists to
        // prevent, and the recompute wrote nothing.
        await api.patch(`/fields/${field.id}`, { options: field.options ?? {} })
      }
      return report
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      if (report && (report.conflicts ?? []).length > 0) {
        setConflicts(report.conflicts ?? [])
        setBanner(tConfig.field.recomputeConflict)
        return
      }
      if (report) queryClient.invalidateQueries({ queryKey: ["assets"] })
      onClose()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const submit = () => {
    setConflicts([])
    setBanner(null)
    if (ruleChanged) {
      setConfirming(true)
      return
    }
    save.mutate()
  }

  const remove = useMutation({
    mutationFn: () => api.del(`/fields/${field.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      onClose()
    },
    onError: (e) => {
      // The refusal carries whatever is standing in the way -- templates that
      // read the field, or the devices that already hold values for it. Either
      // list is exactly what the user needs in order to act.
      if (e instanceof ApiError) {
        setBanner(e.message)
        setRefBlockers(e.referrers ?? (e.blockers ? [] : (referrers.data ?? [])))
        setAssetBlockers(e.blockers ?? [])
      } else {
        setBanner(t.common.error)
      }
    },
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tConfig.field.edit}：{field.label}
            <Badge variant="secondary">{tMeta.fieldTypes[field.type] ?? field.type}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="fe-label">{tMeta.fields.label}</FieldLabel>
            <Input id="fe-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>

          {field.type === "text" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fe-regex">{tConfig.field.regex}</FieldLabel>
                <Input
                  id="fe-regex"
                  className="font-mono"
                  value={options.regex ?? ""}
                  onChange={(e) => set({ regex: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fe-regex-hint">{tConfig.field.regexHint}</FieldLabel>
                <Input
                  id="fe-regex-hint"
                  value={options.regex_hint ?? ""}
                  onChange={(e) => set({ regex_hint: e.target.value })}
                />
              </Field>
            </div>
          )}

          {field.type === "number" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="fe-min">{tConfig.field.min}</FieldLabel>
                <Input
                  id="fe-min"
                  type="number"
                  value={options.min ?? ""}
                  onChange={(e) =>
                    set({ min: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fe-max">{tConfig.field.max}</FieldLabel>
                <Input
                  id="fe-max"
                  type="number"
                  value={options.max ?? ""}
                  onChange={(e) =>
                    set({ max: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fe-unit">{tConfig.field.unit}</FieldLabel>
                <Input
                  id="fe-unit"
                  value={options.unit ?? ""}
                  onChange={(e) => set({ unit: e.target.value })}
                />
              </Field>
            </div>
          )}

          {field.type === "computed" && (
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="fe-template">{tConfig.field.template}</FieldLabel>
                <ExpressionHelp />
              </div>
              <Input
                id="fe-template"
                className="font-mono"
                placeholder="hex2dec(attrs.mac)"
                value={options.template ?? ""}
                onChange={(e) => set({ template: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{tConfig.field.templateHint}</p>
              <p className="text-xs text-muted-foreground">{tConfig.field.depsHint}</p>
            </Field>
          )}

          <div className="grid gap-2">
            {/* Which kind of thing this field hangs on. Frozen once either kind
              of binding exists: switching would have to drop what is there,
              and dropping bindings is a decision of its own (015). */}
            <Field>
              <FieldLabel htmlFor="fe-mode">{tMeta.fields.bindingMode}</FieldLabel>
              <ToggleGroup
                id="fe-mode"
                type="single"
                variant="outline"
                className="justify-start"
                value={mode}
                onValueChange={(v) => {
                  if (v === "category" || v === "model") {
                    setMode(v)
                    setBindTo("")
                  }
                }}
                disabled={bound.length > 0 || boundModels.length > 0}
              >
                <ToggleGroupItem value="category" aria-label={tMeta.fields.bindByCategory}>
                  {tMeta.fields.bindByCategory}
                </ToggleGroupItem>
                <ToggleGroupItem value="model" aria-label={tMeta.fields.bindByModel}>
                  {tMeta.fields.bindByModel}
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {bound.length > 0 || boundModels.length > 0
                  ? tMeta.fields.bindingModeFrozen
                  : tMeta.fields.bindingModeHint}
              </FieldDescription>
            </Field>

            <p className="text-sm font-medium">
              {mode === "model" ? tMeta.fields.models : tMeta.fields.categories}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="w-auto">
                <FieldLabel htmlFor="fe-bind">{tMeta.categories.bind}</FieldLabel>
                <Select value={bindTo} onValueChange={setBindTo}>
                  <SelectTrigger id="fe-bind" className="w-56">
                    <SelectValue placeholder={t.common.select} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {mode === "model"
                        ? (models.data ?? [])
                            .filter((m) => !boundModels.includes(m.id))
                            .map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                                {m.vendor ? `（${m.vendor}）` : ""}
                              </SelectItem>
                            ))
                        : (categories.data ?? [])
                            .filter((c) => !bound.includes(c.id))
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal" className="w-auto pb-2">
                <Checkbox
                  id="fe-bind-required"
                  checked={bindRequired}
                  onCheckedChange={(v) => setBindRequired(v === true)}
                />
                <FieldLabel htmlFor="fe-bind-required">{tMeta.categories.required}</FieldLabel>
              </Field>
              <Button
                className="mb-0.5"
                size="sm"
                onClick={() => (mode === "model" ? bindModel.mutate() : bind.mutate())}
                disabled={bindTo === "" || bind.isPending || bindModel.isPending}
              >
                {tMeta.categories.bind}
              </Button>
            </div>

            {/* Required is checked when an asset is written, not when the field
              is bound, so the devices already recorded keep their gap until
              someone edits one. Worth saying before the box is ticked. */}
            {bindRequired &&
              ((mode === "model" ? modelPopulated.data?.total : populated.data?.total) ?? 0) >
                0 && (
                <Alert>
                  <AlertCircleIcon />
                  <AlertDescription>
                    {tMeta.categories.requiredWarning(
                      (mode === "model" ? modelPopulated.data?.total : populated.data?.total) ?? 0,
                    )}
                  </AlertDescription>
                </Alert>
              )}

            {mode === "model" ? (
              <TableFrame>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tMeta.fields.models}</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boundModels.map((id) => {
                      const m = (models.data ?? []).find((x) => x.id === id)
                      return (
                        <TableRow key={id} aria-label={m?.name}>
                          <TableCell>
                            {m?.name ?? id}
                            {m?.vendor ? `（${m.vendor}）` : ""}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => unbindModel.mutate(id)}
                              disabled={unbindModel.isPending}
                            >
                              {tMeta.categories.unbind}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableFrame>
            ) : (
              <TableFrame>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tMeta.categories.title}</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bound.map((id) => (
                      <ContextMenu key={id}>
                        <ContextMenuTrigger asChild>
                          <TableRow
                            aria-label={(categories.data ?? []).find((c) => c.id === id)?.name}
                          >
                            <TableCell>
                              {(categories.data ?? []).find((c) => c.id === id)?.name ?? id}
                            </TableCell>
                            {/* Visible, not only on right-click. These rows do
                            nothing when clicked, so there is no gesture for a
                            hidden menu to belong to -- and a two-row table
                            inside a dialog is the last place anybody thinks to
                            try one. The menu stays for anyone who does. */}
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setUnbinding(id)}
                              >
                                {tMeta.categories.unbind}
                              </Button>
                            </TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem variant="destructive" onSelect={() => setUnbinding(id)}>
                            {tMeta.categories.unbind}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            )}
            {mode === "model"
              ? boundModels.length === 0 && (
                  <p className="text-muted-foreground text-sm">{tMeta.fields.unboundModelHint}</p>
                )
              : bound.length === 0 && (
                  <p className="text-muted-foreground text-sm">{tMeta.fields.unboundHint}</p>
                )}
          </div>

          {(referrers.data ?? []).length > 0 && (
            <p className="text-sm text-muted-foreground">
              {tConfig.field.referrers}
              {(referrers.data ?? []).map((r) => r.label).join("、")}
            </p>
          )}

          {banner && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription className="grid gap-1">
                {banner}
                {refBlockers.length > 0 && (
                  <ul className="grid gap-0.5 text-xs">
                    {refBlockers.map((b) => (
                      <li key={b.id}>{b.label}</li>
                    ))}
                  </ul>
                )}
                {conflicts.length > 0 && (
                  <ul className="grid gap-0.5 font-mono text-xs">
                    {conflicts.map((c, i) => (
                      <li key={i}>
                        {tConfig.field.conflictRow(c.key, c.value, c.assets.join("、"))}
                      </li>
                    ))}
                  </ul>
                )}
                {assetBlockers.length > 0 && (
                  <>
                    <p className="text-xs">{tConfig.field.blockedByAssets}</p>
                    <ul className="grid gap-0.5 font-mono text-xs">
                      {assetBlockers.map((b) => (
                        <li key={blockerKey(b)}>{b.name}</li>
                      ))}
                    </ul>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          {/* Deleting sits on the far side of the footer, away from the two
              buttons that get pressed on the way out. */}
          <ConfirmDialog
            trigger={
              <Button variant="destructive" className="mr-auto" disabled={remove.isPending}>
                {tConfig.field.delete}
              </Button>
            }
            title={tConfig.field.deleteTitle}
            description={tConfig.field.deleteHint(field.label)}
            confirmLabel={tConfig.field.delete}
            requirePhrase={field.key}
            onConfirm={() => remove.mutate()}
          />
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {save.isPending ? tConfig.field.saving : tConfig.field.save}
          </Button>

          {/* Saving a changed rule and recomputing what it governs are one
              decision, not two: leaving them apart is what let new devices be
              numbered one way and old ones another. Declining recompute
              therefore declines the save. */}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={tConfig.field.recomputeTitle}
            description={tConfig.field.recomputeHint}
            confirmLabel={tConfig.field.recomputeConfirm}
            onConfirm={() => save.mutate()}
          />
        </DialogFooter>
        <ConfirmDialog
          open={unbinding !== null}
          onOpenChange={(next) => !next && setUnbinding(null)}
          title={tMeta.categories.unbindTitle}
          description={tMeta.categories.unbindHint(field.label)}
          confirmLabel={tMeta.categories.unbind}
          onConfirm={() => unbinding && unbind.mutate(unbinding)}
        />
      </DialogContent>
    </Dialog>
  )
}
