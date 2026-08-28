import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type FieldErrors } from "@/lib/api"
import type { Asset, CategorySchema } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { zh, zhTransfer } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { Timeline } from "@/features/transfers/Timeline"
import { EditEvent } from "@/features/transfers/EditEvent"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DetailResponse {
  asset: Asset
  sn_history: string[]
}

export function AssetDetail() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [editing, setEditing] = useState<Transfer | null>(null)

  const detail = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get<DetailResponse>(`/assets/${id}`),
  })

  const asset = detail.data?.asset

  const timeline = useQuery({
    queryKey: ["timeline", id],
    queryFn: () => api.get<Transfer[]>(`/assets/${id}/transfers`),
  })
  // Only the newest event may still be corrected; the window closes as soon as
  // the asset moves again.
  const tailID = timeline.data?.[timeline.data.length - 1]?.id

  const schema = useQuery({
    queryKey: ["schema", asset?.category_id],
    queryFn: () => api.get<CategorySchema>(`/categories/${asset!.category_id}/schema`),
    enabled: !!asset,
  })

  useEffect(() => {
    if (asset) setValues(asset.attrs)
  }, [asset])

  const save = useMutation({
    mutationFn: () =>
      api.patch<Asset>(`/assets/${id}`, {
        category_id: asset!.category_id,
        model_id: asset!.model_id,
        status: asset!.status,
        owner_id: asset!.owner?.id,
        holder_type: asset!.holder.type,
        holder_id: asset!.holder.id,
        attrs: values,
        version: asset!.version,
      }),
    onSuccess: (updated) => {
      setFieldErrors({})
      if (asset && updated.sn !== asset.sn) {
        setBanner(zh.assets.snChanged(asset.sn, updated.sn))
      } else {
        setBanner(zh.assets.saved)
      }
      queryClient.invalidateQueries({ queryKey: ["asset", id] })
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields ?? {})
        // A stale version is not something to retry silently: someone else's
        // edit would be overwritten. Say so and make the user reload.
        setBanner(err.message)
      }
    },
  })

  const remove = useMutation({
    mutationFn: () => api.del<void>(`/assets/${id}?confirm_sn=${encodeURIComponent(asset!.sn)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      navigate("/assets", { replace: true })
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  const archived = Object.entries(asset?.archived_attrs ?? {})

  return (
    <StateBoundary
      isLoading={detail.isLoading}
      error={detail.error as Error | null}
      onRetry={() => detail.refetch()}
    >
      {asset && (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-semibold">{asset.sn}</h1>
            <Badge variant="secondary">{zh.status[asset.status] ?? asset.status}</Badge>
            {(detail.data?.sn_history ?? []).length > 0 && (
              <span className="text-sm text-muted-foreground">
                {zh.common.formerSN(detail.data!.sn_history.join("、"))}
              </span>
            )}
          </div>

          {banner && (
            <p role="status" className="rounded-md border bg-secondary px-3 py-2 text-sm">
              {banner}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{zh.assets.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">{zh.assets.holder}</dt>
                  <dd>{asset.holder.name ?? asset.holder.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{zh.assets.owner}</dt>
                  <dd>{asset.owner?.name ?? zh.common.none}</dd>
                </div>
              </dl>

              {schema.data && (
                <DynamicForm
                  fields={schema.data.fields}
                  values={values}
                  errors={fieldErrors}
                  onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
                />
              )}

              <div>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? zh.assets.saving : zh.assets.save}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{zhTransfer.timeline}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {editing && (
                <EditEvent event={editing} assetID={id} onClose={() => setEditing(null)} />
              )}
              <Timeline
                events={timeline.data ?? []}
                isLoading={timeline.isLoading}
                error={timeline.error as Error | null}
                editableId={tailID}
                onEdit={setEditing}
              />
            </CardContent>
          </Card>

          {archived.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline">{zh.assets.archivedFields}（{archived.length}）</Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 rounded-md border p-4">
                  <p className="mb-3 text-sm text-muted-foreground">{zh.assets.archivedHint}</p>
                  <dl className="grid gap-2 text-sm">
                    {archived.map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <dt className="font-mono text-muted-foreground">{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{zh.assets.deleteTitle}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" className="w-fit" disabled={remove.isPending}>
                    {zh.assets.delete}
                  </Button>
                }
                title={zh.assets.deleteTitle}
                description={zh.assets.deleteHint(asset.sn)}
                confirmLabel={zh.assets.delete}
                requirePhrase={asset.sn}
                onConfirm={() => remove.mutate()}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </StateBoundary>
  )
}
