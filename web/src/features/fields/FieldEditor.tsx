import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type Blocker, type Referrer } from "@/lib/api"
import type { EnumChoice, FieldOptions } from "@/lib/types"
import type { FieldDefinitionRow } from "@/lib/metaTypes"
import { zh, zhConfig, zhMeta } from "@/i18n/zh"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
    onError: (e) => setBanner(e instanceof ApiError ? e.message : zh.common.error),
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
        setBanner(zh.common.error)
      }
    },
  })

  const toggleDeprecated = (value: string) => {
    const cur = options.deprecated ?? []
    set({ deprecated: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] })
  }

  const addChoice = () =>
    set({ choices: [...(options.choices ?? []), { value: "", label: "" }] })

  const setChoice = (i: number, patch: Partial<EnumChoice>) =>
    set({
      choices: (options.choices ?? []).map((c, j) => (j === i ? { ...c, ...patch } : c)),
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {zhConfig.field.edit}：{field.label}
          <Badge variant="secondary" className="ml-2">
            {zhMeta.fieldTypes[field.type] ?? field.type}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="fe-label">{zhMeta.fields.label}</Label>
          <Input id="fe-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        {field.type === "text" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fe-regex">{zhConfig.field.regex}</Label>
              <Input
                id="fe-regex"
                className="font-mono"
                value={options.regex ?? ""}
                onChange={(e) => set({ regex: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fe-regex-hint">{zhConfig.field.regexHint}</Label>
              <Input
                id="fe-regex-hint"
                value={options.regex_hint ?? ""}
                onChange={(e) => set({ regex_hint: e.target.value })}
              />
            </div>
          </div>
        )}

        {field.type === "number" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="fe-min">{zhConfig.field.min}</Label>
              <Input
                id="fe-min"
                type="number"
                value={options.min ?? ""}
                onChange={(e) => set({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fe-max">{zhConfig.field.max}</Label>
              <Input
                id="fe-max"
                type="number"
                value={options.max ?? ""}
                onChange={(e) => set({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fe-unit">{zhConfig.field.unit}</Label>
              <Input
                id="fe-unit"
                value={options.unit ?? ""}
                onChange={(e) => set({ unit: e.target.value })}
              />
            </div>
          </div>
        )}

        {field.type === "enum" && (
          <div className="grid gap-3">
            <Label>{zhConfig.field.choices}</Label>
            <p className="text-xs text-muted-foreground">{zhConfig.field.deprecateHint}</p>
            {(options.choices ?? []).map((c, i) => {
              const retired = (options.deprecated ?? []).includes(c.value)
              return (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-1">
                    <Label htmlFor={`fe-choice-value-${i}`} className="text-xs">
                      {zhConfig.field.choiceValue}
                    </Label>
                    <Input
                      id={`fe-choice-value-${i}`}
                      className="w-40 font-mono"
                      value={c.value}
                      onChange={(e) => setChoice(i, { value: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`fe-choice-label-${i}`} className="text-xs">
                      {zhConfig.field.choiceLabel}
                    </Label>
                    <Input
                      id={`fe-choice-label-${i}`}
                      className="w-40"
                      value={c.label}
                      onChange={(e) => setChoice(i, { label: e.target.value })}
                    />
                  </div>
                  {retired && <Badge variant="outline">{zhConfig.field.deprecated}</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleDeprecated(c.value)}
                  >
                    {retired ? zhConfig.field.restore : zhConfig.field.deprecate}
                  </Button>
                </div>
              )
            })}
            <div>
              <Button variant="outline" size="sm" onClick={addChoice}>
                {zhConfig.field.addChoice}
              </Button>
            </div>
          </div>
        )}

        {field.type === "reference" && (
          <div className="grid gap-1.5">
            <Label htmlFor="fe-target">{zhConfig.field.target}</Label>
            <select
              id="fe-target"
              className="border-input bg-background h-9 w-56 rounded-md border px-3 text-sm"
              value={options.target ?? "user"}
              onChange={(e) => set({ target: e.target.value as "user" | "entity" })}
            >
              <option value="user">{zhConfig.field.targetUser}</option>
              <option value="entity">{zhConfig.field.targetEntity}</option>
            </select>
          </div>
        )}

        {field.type === "computed" && (
          <div className="grid gap-1.5">
            <Label htmlFor="fe-template">{zhConfig.field.template}</Label>
            <Input
              id="fe-template"
              className="font-mono"
              value={options.template ?? ""}
              onChange={(e) => set({ template: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{zhConfig.field.templateHint}</p>
            <p className="text-xs text-muted-foreground">{zhConfig.field.depsHint}</p>
          </div>
        )}

        {(referrers.data ?? []).length > 0 && (
          <p className="text-sm text-muted-foreground">
            {zhConfig.field.referrers}
            {(referrers.data ?? []).map((r) => r.label).join("、")}
          </p>
        )}

        {banner && (
          <div role="alert" className="grid gap-1 text-sm text-destructive">
            <p>{banner}</p>
            {refBlockers.length > 0 && (
              <ul className="grid gap-0.5 text-xs">
                {refBlockers.map((b) => (
                  <li key={b.id}>{b.label}</li>
                ))}
              </ul>
            )}
            {assetBlockers.length > 0 && (
              <>
                <p className="text-xs">{zhConfig.field.blockedByAssets}</p>
                <ul className="grid gap-0.5 font-mono text-xs">
                  {assetBlockers.map((b) => (
                    <li key={b.asset_id}>{b.name}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? zhConfig.field.saving : zhConfig.field.save}
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="destructive" disabled={remove.isPending}>
                {zhConfig.field.delete}
              </Button>
            }
            title={zhConfig.field.deleteTitle}
            description={zhConfig.field.deleteHint(field.label)}
            confirmLabel={zhConfig.field.delete}
            onConfirm={() => remove.mutate()}
          />
          <Button variant="ghost" onClick={onClose}>
            {zh.common.cancel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
