import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { zh, zhConfig } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface RecomputeSample {
  from: string
  to: string
}

interface Conflict {
  sn: string
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
  template: string
  /** Set when the rule comes from an ancestor rather than this category. */
  inheritedFromName?: string
}

/**
 * Edits the serial-number rule and, separately, re-derives existing numbers.
 *
 * The two are deliberately not one button. Saving the rule only affects assets
 * created afterwards; renumbering thousands of existing devices is a decision
 * of its own, and it is taken after seeing the blast radius rather than before.
 */
export function SnTemplateEditor({ categoryID, categoryName, template, inheritedFromName }: Props) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(template)
  const [report, setReport] = useState<RecomputeReport | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => api.patch(`/categories/${categoryID}`, { sn_template: value }),
    onSuccess: () => {
      setBanner(zhConfig.sn.ruleChangedHint)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      queryClient.invalidateQueries({ queryKey: ["schema", categoryID] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : zh.common.error),
  })

  const preview = useMutation({
    mutationFn: () =>
      api.post<RecomputeReport>(`/categories/${categoryID}/recompute-sn?dry_run=true`, {}),
    onSuccess: (r) => {
      setBanner(null)
      setReport(r)
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : zh.common.error),
  })

  const apply = useMutation({
    mutationFn: () =>
      api.post<RecomputeReport>(`/categories/${categoryID}/recompute-sn?dry_run=false`, {}),
    onSuccess: (r) => {
      setReport(null)
      setBanner(zhConfig.sn.applied(r.affected))
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : zh.common.error),
  })

  const conflicts = report?.conflicts ?? []
  const canApply = report !== null && conflicts.length === 0 && report.affected > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{zhConfig.sn.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {inheritedFromName && (
          <p className="text-sm text-muted-foreground">
            {zhConfig.sn.inheritedFrom(inheritedFromName)}
          </p>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="sn-template">{zhConfig.sn.template}</Label>
          <Input
            id="sn-template"
            className="font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{zhConfig.sn.hint}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {zhConfig.sn.save}
          </Button>
          <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending}>
            {preview.isPending ? zhConfig.sn.previewing : zhConfig.sn.recompute}
          </Button>
        </div>

        {banner && (
          <p role="status" className="rounded-md border bg-secondary px-3 py-2 text-sm">
            {banner}
          </p>
        )}

        {report && (
          <section
            aria-label={zhConfig.sn.previewTitle}
            className="grid gap-3 rounded-md border p-4"
          >
            <h3 className="font-medium">
              {zhConfig.sn.previewTitle}：{categoryName}
            </h3>

            <p className="text-sm">
              {report.affected === 0
                ? zhConfig.sn.noChange
                : zhConfig.sn.affected(report.affected, report.total)}
            </p>

            {(report.samples ?? []).length > 0 && (
              <div className="text-sm">
                <p className="text-muted-foreground">{zhConfig.sn.samples}</p>
                <ul className="mt-1 grid gap-0.5 font-mono text-xs">
                  {(report.samples ?? []).map((s) => (
                    <li key={s.from}>
                      {s.from} → {s.to}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {conflicts.length > 0 && (
              <div role="alert" className="grid gap-1 text-sm text-destructive">
                <p>{zhConfig.sn.conflicts(conflicts.length)}</p>
                <ul className="grid gap-0.5 font-mono text-xs">
                  {conflicts.map((c) => (
                    <li key={c.sn}>{zhConfig.sn.conflictRow(c.sn, c.assets.join("、"))}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground">{zhConfig.sn.conflictHint}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button disabled={!canApply || apply.isPending} onClick={() => apply.mutate()}>
                {apply.isPending ? zhConfig.sn.applying : zhConfig.sn.apply}
              </Button>
              <Button variant="ghost" onClick={() => setReport(null)}>
                {zhConfig.sn.cancel}
              </Button>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
