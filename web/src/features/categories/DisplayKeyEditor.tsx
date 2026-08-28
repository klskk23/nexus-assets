import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { BoundField } from "@/lib/types"
import { zh, zhConfig } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

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
      setBanner(zhConfig.displayKey.saved)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      queryClient.invalidateQueries({ queryKey: ["category-schema", categoryID] })
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  const preview = useMutation({
    mutationFn: () =>
      api.post<RecomputeReport>(`/categories/${categoryID}/recompute?dry_run=true`, {}),
    onSuccess: (r) => {
      setBanner(null)
      setReport(r)
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  const apply = useMutation({
    mutationFn: () =>
      api.post<RecomputeReport>(`/categories/${categoryID}/recompute?dry_run=false`, {}),
    onSuccess: (r) => {
      setReport(null)
      setBanner(zhConfig.displayKey.applied(r.affected))
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  const conflicts = report?.conflicts ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{zhConfig.displayKey.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="display-key">{zhConfig.displayKey.label}</Label>
          <select
            id="display-key"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">{zhConfig.displayKey.none}</option>
            {candidates.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}（{f.key}）
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{zhConfig.displayKey.hint}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {zhConfig.displayKey.save}
          </Button>
          <Button size="sm" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate()}>
            {preview.isPending ? zhConfig.displayKey.previewing : zhConfig.displayKey.recompute}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{zhConfig.displayKey.ruleChangedHint}</p>

        {report && (
          <div
            role="region"
            aria-label={zhConfig.displayKey.previewTitle}
            className="grid gap-2 rounded-md border p-3 text-sm"
          >
            <p className="font-medium">
              {zhConfig.displayKey.previewTitle}：{categoryName}
            </p>
            <p>
              {report.affected === 0
                ? zhConfig.displayKey.noChange
                : zhConfig.displayKey.affected(report.affected, report.total)}
            </p>

            {(report.samples ?? []).length > 0 && (
              <div className="grid gap-1">
                <p className="text-muted-foreground">{zhConfig.displayKey.samples}</p>
                <ul className="grid gap-0.5 font-mono text-xs">
                  {(report.samples ?? []).map((s, i) => (
                    <li key={i}>{zhConfig.displayKey.sampleRow(s.asset, s.key, s.from, s.to)}</li>
                  ))}
                </ul>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="grid gap-1 text-destructive">
                <p>{zhConfig.displayKey.conflicts(conflicts.length)}</p>
                <ul className="grid gap-0.5 font-mono text-xs">
                  {conflicts.map((c, i) => (
                    <li key={i}>
                      {zhConfig.displayKey.conflictRow(c.key, c.value, c.assets.join("、"))}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">{zhConfig.displayKey.conflictHint}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={conflicts.length > 0 || report.affected === 0 || apply.isPending}
                onClick={() => apply.mutate()}
              >
                {apply.isPending ? zhConfig.displayKey.applying : zhConfig.displayKey.apply}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReport(null)}>
                {zhConfig.displayKey.cancel}
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
