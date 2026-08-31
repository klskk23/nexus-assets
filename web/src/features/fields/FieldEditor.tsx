import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, blockerKey, type Blocker, type Referrer } from "@/lib/api"
import type { FieldOptions } from "@/lib/types"
import type { FieldDefinitionRow } from "@/lib/metaTypes"
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
import { ExpressionHelp } from "@/features/fields/ExpressionHelp"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"

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

  const referrers = useQuery({
    queryKey: ["referrers", field.id],
    queryFn: () => api.get<Referrer[]>(`/fields/${field.id}/referrers`),
  })

  const set = (patch: Partial<FieldOptions>) => setOptions((o) => ({ ...o, ...patch }))

  const save = useMutation({
    mutationFn: () => api.patch(`/fields/${field.id}`, { label, options }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      onClose()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

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
        setRefBlockers(e.referrers ?? (e.blockers ? [] : referrers.data ?? []))
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
                onChange={(e) => set({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="fe-max">{tConfig.field.max}</FieldLabel>
              <Input
                id="fe-max"
                type="number"
                value={options.max ?? ""}
                onChange={(e) => set({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
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
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {save.isPending ? tConfig.field.saving : tConfig.field.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
