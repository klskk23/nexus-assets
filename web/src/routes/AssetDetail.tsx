import { ArrowLeftIcon, InfoIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type FieldErrors } from "@/lib/api"
import type { Asset, CategorySchema } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { zh, zhTransfer } from "@/i18n/zh"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { StateBoundary } from "@/components/StateBoundary"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { Timeline } from "@/features/transfers/Timeline"
import { EditEvent } from "@/features/transfers/EditEvent"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { ModelPicker } from "@/features/assets/ModelPicker"
import { TransferDialog } from "@/features/transfers/TransferDialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface HistoricValue {
  key: string
  value: string
  archived_at: string
}

interface DetailResponse {
  asset: Asset
  value_history: HistoricValue[]
}

export function AssetDetail() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [modelId, setModelId] = useState<string | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)

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
    if (asset) {
      setValues(asset.attrs)
      setModelId(asset.model_id)
    }
  }, [asset])

  const save = useMutation({
    mutationFn: () =>
      api.patch<Asset>(`/assets/${id}`, {
        category_id: asset!.category_id,
        model_id: modelId,
        status: asset!.status,
        owner_id: asset!.owner?.id,
        holder_type: asset!.holder.type,
        holder_id: asset!.holder.id,
        attrs: values,
        version: asset!.version,
      }),
    onSuccess: (updated) => {
      setFieldErrors({})
      if (asset && updated.display_name !== asset.display_name) {
        setBanner(zh.assets.snChanged(asset.display_name, updated.display_name))
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
    mutationFn: () =>
      api.del<void>(`/assets/${id}?confirm=${encodeURIComponent(asset!.display_name)}`),
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
          {/* A link to the list rather than browser back: you can arrive here
              from the overview, a scan, or straight after recording a device,
              and "back" from those is three different places. */}
          <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
            <Link to="/assets">
              <ArrowLeftIcon data-icon="inline-start" />
              {zh.assets.backToList}
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-semibold">{asset.display_name}</h1>
            <StatusBadge status={asset.status} />
            <Button className="ml-auto" onClick={() => setTransferOpen(true)}>
              {zh.assets.transfer}
            </Button>
          </div>

          <TransferDialog
            assetIDs={[id]}
            open={transferOpen}
            onOpenChange={setTransferOpen}
            onDone={() => {
              setBanner(zhTransfer.actions.done(1))
              queryClient.invalidateQueries({ queryKey: ["asset", id] })
              queryClient.invalidateQueries({ queryKey: ["timeline", id] })
            }}
          />

          {banner && (
            <Alert role="status">
              <InfoIcon />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
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

              <ModelPicker
                categoryID={asset.category_id}
                value={modelId}
                values={values}
                confirmOverwrite
                onChange={(mid, patch) => {
                  setModelId(mid)
                  setValues((cur) => ({ ...cur, ...patch }))
                }}
              />

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
                  {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
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

          {(detail.data?.value_history ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{zh.assets.valueHistory}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <p className="text-sm text-muted-foreground">{zh.assets.valueHistoryHint}</p>
                <ul className="grid gap-1 font-mono text-sm">
                  {(detail.data?.value_history ?? []).map((h, i) => (
                    <li key={i}>
                      {h.key}: {h.value}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

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
                description={zh.assets.deleteHint(asset.display_name)}
                confirmLabel={zh.assets.delete}
                requirePhrase={asset.display_name}
                onConfirm={() => remove.mutate()}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </StateBoundary>
  )
}
