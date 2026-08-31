import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { BoundField } from "@/lib/types"
import { t, tConfig } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface RecomputeSample {
  asset: string
  key: string
  from: string
  to: string
}

interface Conflict {
  key: string
  value: string
  assets: string[]
}

export interface RecomputeReport {
  affected: number
  total: number
  conflicts: Conflict[] | null
  applied: boolean
  samples: RecomputeSample[] | null
}

interface Props {
  categoryID: string
  categoryName: string
  displayKey: string
  fields: BoundField[]
}

/**
 * Picks which bound field is the number people read aloud, and separately
 * re-derives the stored values of a subtree.
 *
 * The two are deliberately not one button. Editing an expression only affects
 * assets created afterwards; renumbering thousands of existing devices is a
 * decision of its own, taken after seeing the blast radius rather than before.
 */
export function DisplayKeyEditor({ categoryID, categoryName, displayKey, fields }: Props) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(displayKey)
  const [report, setReport] = useState<RecomputeReport | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  // Only unique fields are offered: a number two devices can share is not an
  // identifier, and the server refuses the rest anyway.
  const candidates = fields.filter((f) => f.is_unique)

  const save = useMutation({
    mutationFn: () => api.patch(`/categories/${categoryID}`, { display_key: value }),
    onSuccess: () => {
      setBanner(tConfig.displayKey.saved)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      queryClient.invalidateQueries({ queryKey: ["category-schema", categoryID] })
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  const preview = useMutation({
    mutationFn: () =>
      api.post<RecomputeReport>(`/categories/${categoryID}/recompute?dry_run=true`, {}),
    onSuccess: (r) => {
      setBanner(null)
      setReport(r)
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  const apply = useMutation({
    mutationFn: () =>
      api.post<RecomputeReport>(`/categories/${categoryID}/recompute?dry_run=false`, {}),
    onSuccess: (r) => {
      setReport(null)
      setBanner(tConfig.displayKey.applied(r.affected))
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  const conflicts = report?.conflicts ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tConfig.displayKey.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Field>
          <FieldLabel htmlFor="display-key">{tConfig.displayKey.label}</FieldLabel>
          <Select value={toNone(value)} onValueChange={(v) => setValue(fromNone(v))}>
            <SelectTrigger id="display-key">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{tConfig.displayKey.none}</SelectItem>
                {candidates.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}（{f.key}）
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{tConfig.displayKey.hint}</FieldDescription>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {tConfig.displayKey.save}
          </Button>
          <Button size="sm" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate()}>
            {preview.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {preview.isPending ? tConfig.displayKey.previewing : tConfig.displayKey.recompute}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{tConfig.displayKey.ruleChangedHint}</p>

        {report && (
          <div
            role="region"
            aria-label={tConfig.displayKey.previewTitle}
            className="grid gap-2 rounded-md border p-3 text-sm"
          >
            <p className="font-medium">
              {tConfig.displayKey.previewTitle}：{categoryName}
            </p>
            <p>
              {report.affected === 0
                ? tConfig.displayKey.noChange
                : tConfig.displayKey.affected(report.affected, report.total)}
            </p>

            {(report.samples ?? []).length > 0 && (
              <div className="grid gap-1">
                <p className="text-muted-foreground">{tConfig.displayKey.samples}</p>
                <ul className="grid gap-0.5 font-mono text-xs">
                  {(report.samples ?? []).map((s, i) => (
                    <li key={i}>{tConfig.displayKey.sampleRow(s.asset, s.key, s.from, s.to)}</li>
                  ))}
                </ul>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="grid gap-1 text-destructive">
                <p>{tConfig.displayKey.conflicts(conflicts.length)}</p>
                <ul className="grid gap-0.5 font-mono text-xs">
                  {conflicts.map((c, i) => (
                    <li key={i}>
                      {tConfig.displayKey.conflictRow(c.key, c.value, c.assets.join("、"))}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">{tConfig.displayKey.conflictHint}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={conflicts.length > 0 || report.affected === 0 || apply.isPending}
                onClick={() => apply.mutate()}
              >
                {apply.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {apply.isPending ? tConfig.displayKey.applying : tConfig.displayKey.apply}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReport(null)}>
                {tConfig.displayKey.cancel}
              </Button>
            </div>
          </div>
        )}

        {banner && (
          <p role="status" className="text-sm">
            {banner}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
