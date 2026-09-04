import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker, type Referrer } from "@/lib/api"
import type { AssetPage, Category, Conflict, RecomputeReport } from "@/lib/types"
import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { t, tConfig, tMeta } from "@/i18n"
import { Badge } from "@/components/ui/badge"
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
import { FieldForm, type FieldFormValue } from "@/features/fields/FieldForm"

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
  // The same value the create dialog builds, so one form serves both. Key,
  // type and uniqueness ride along read-only: FieldForm freezes them in edit
  // mode, which is where the "唯一 cannot change" rule is enforced in the UI.
  const [draft, setDraft] = useState<FieldFormValue>({
    key: field.key,
    label: field.label,
    type: field.type,
    isUnique: field.is_unique,
    required: field.required ?? false,
    options: field.options ?? {},
    bindTo:
      (field.model_ids ?? []).length > 0 ? (field.model_ids ?? []) : (field.category_ids ?? []),
    bindMode: (field.model_ids ?? []).length > 0 ? "model" : "category",
  })
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
  // Unticking a binding takes a value off every device in that category or
  // model, so it asks first.
  const [unbinding, setUnbinding] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })

  // How many devices marking it required would eventually ask. Required is
  // checked when an asset is written, so the answer is a promise about their
  // next edit rather than anything that happens now.
  const populated = useQuery({
    queryKey: ["binding-asset-count", draft.bindMode, draft.bindTo],
    queryFn: async () => {
      const counts = await Promise.all(
        draft.bindTo.map((id) =>
          draft.bindMode === "model"
            ? api.get<{ total: number }>(`/models/${id}/required-impact`).then((r) => r.total)
            : api
                .get<AssetPage>(`/assets?category_id=${id}&include_descendants=true&limit=1`)
                .then((r) => r.total),
        ),
      )
      return counts.reduce((a, b) => a + b, 0)
    },
    enabled: draft.bindTo.length > 0 && draft.required,
  })

  // The field already exists, so ticking a box is a binding, not an intention:
  // it goes to the server now and the checkbox follows the answer. (Creating
  // is the other way round -- there is nothing to bind to yet.)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["fields"] })
    queryClient.invalidateQueries({ queryKey: ["schema"] })
  }
  const tick = (id: string) => setDraft((d) => ({ ...d, bindTo: [...d.bindTo, id] }))
  const untick = (id: string) =>
    setDraft((d) => ({ ...d, bindTo: d.bindTo.filter((x) => x !== id) }))

  const bindModel = useMutation({
    mutationFn: (modelID: string) =>
      api.post(`/models/${modelID}/bindings`, { field_id: field.id }),
    onSuccess: (_data, modelID) => {
      setBanner(null)
      tick(modelID)
      refresh()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const unbindModel = useMutation({
    mutationFn: (modelID: string) => api.del(`/models/${modelID}/bindings/${field.id}`),
    onSuccess: (_data, modelID) => {
      setBanner(null)
      untick(modelID)
      refresh()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const bind = useMutation({
    mutationFn: (categoryID: string) =>
      api.post(`/categories/${categoryID}/bindings`, { field_id: field.id }),
    onSuccess: (_data, categoryID) => {
      setBanner(null)
      tick(categoryID)
      refresh()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const unbind = useMutation({
    mutationFn: (categoryID: string) => api.del(`/categories/${categoryID}/bindings/${field.id}`),
    onSuccess: (_data, categoryID) => {
      setBanner(null)
      untick(categoryID)
      refresh()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const referrers = useQuery({
    queryKey: ["referrers", field.id],
    queryFn: () => api.get<Referrer[]>(`/fields/${field.id}/referrers`),
  })

  // FieldForm hands back a patch. A change to the ticked bindings is the one
  // that cannot just be recorded: the field exists, so it goes to the server.
  const onFormChange = (patchIn: Partial<FieldFormValue>) => {
    if (patchIn.bindTo !== undefined && patchIn.bindMode === undefined) {
      const added = patchIn.bindTo.filter((id) => !draft.bindTo.includes(id))
      const removed = draft.bindTo.filter((id) => !patchIn.bindTo!.includes(id))
      for (const id of added) {
        if (draft.bindMode === "model") bindModel.mutate(id)
        else bind.mutate(id)
      }
      // Removing takes a value off every device under it, so it asks first.
      if (removed.length > 0) setUnbinding(removed[0])
      return
    }
    setDraft((d) => ({ ...d, ...patchIn }))
  }

  // Whether saving would leave stored values disagreeing with the rule that
  // produced them. Only a changed expression can do that; renaming the field
  // cannot.
  const ruleChanged =
    field.type === "computed" &&
    (draft.options.template ?? "") !== (field.options?.template ?? "")

  const save = useMutation({
    mutationFn: async (): Promise<RecomputeReport | null> => {
      await api.patch(`/fields/${field.id}`, {
        label: draft.label,
        options: draft.options,
        required: draft.required,
      })
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
          <FieldForm
            mode="edit"
            idPrefix="fe"
            value={draft}
            onChange={onFormChange}
            categories={categories.data ?? []}
            models={Array.isArray(models.data) ? models.data : []}
            bindModeFrozen={draft.bindTo.length > 0}
            impact={populated.data}
          />

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
          onConfirm={() =>
            unbinding &&
            (draft.bindMode === "model"
              ? unbindModel.mutate(unbinding)
              : unbind.mutate(unbinding))
          }
        />
      </DialogContent>
    </Dialog>
  )
}
