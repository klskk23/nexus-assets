import { InfoIcon, PrinterIcon } from "lucide-react"
import { Hint } from "@/features/common/Hint"
import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { cn } from "cn"
import { api, ApiError, type FieldErrors } from "@/lib/api"
import type { Asset, CategorySchema, HolderEntity, User } from "@/lib/types"
import { NONE } from "@/lib/select"
import type { Transfer } from "@/lib/transferTypes"
import { t, tTransfer } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { StateBoundary } from "@/components/StateBoundary"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { attrText, fieldsForModel } from "@/features/assets/modelFields"
import { Timeline } from "@/features/transfers/Timeline"
import { EditEvent } from "@/features/transfers/EditEvent"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { ModelPicker } from "@/features/assets/ModelPicker"
import { TransferForm } from "@/features/transfers/TransferForm"
import { PrintDialog } from "@/features/print/PrintDialog"
import { usePrinting } from "@/features/print/usePrinting"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface HistoricValue {
  key: string
  value: string
  archived_at: string
}

interface DetailResponse {
  asset: Asset
  value_history: HistoricValue[]
}

/**
 * One device, opened over the list it was clicked in.
 *
 * A dialog rather than a page of its own, but still an address: a scan that
 * hits exactly one device navigates here, recording a device lands here, and
 * the audit log's "only this object" will too. A dialog held in state has none
 * of that, and no link to send a colleague.
 *
 * Closing goes back to /assets carrying the query string, so the filters the
 * list was wearing are still on when the dialog comes off.
 */
export function AssetDetail() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const close = () => navigate({ pathname: "/assets", search: location.search })
  const queryClient = useQueryClient()

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [note, setNote] = useState("")
  const [modelId, setModelId] = useState<string | null>(null)
  const [homeID, setHomeID] = useState(NONE)
  const [homeOwnerID, setHomeOwnerID] = useState(NONE)
  const [printing, setPrinting] = useState(false)
  const { enabled: canPrint } = usePrinting()
  const { deniedReason } = usePermissions()

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

  const holders = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
  })
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  })

  const schema = useQuery({
    queryKey: ["schema", asset?.category_id],
    queryFn: () => api.get<CategorySchema>(`/categories/${asset!.category_id}/schema`),
    enabled: !!asset,
  })

  useEffect(() => {
    if (asset) {
      setValues(asset.attrs)
      setModelId(asset.model_id)
      setHomeID(asset.home_holder?.id ?? NONE)
      setHomeOwnerID(asset.home_owner?.id ?? NONE)
      setNote(asset.note ?? "")
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
        // Sent explicitly rather than omitted: absent means "leave it alone",
        // and this form is where a home is changed.
        home_holder_type: homeID === NONE ? null : "entity",
        home_holder_id: homeID === NONE ? null : homeID,
        home_owner_id: homeOwnerID === NONE ? null : homeOwnerID,
        attrs: values,
        note,
        version: asset!.version,
      }),
    onSuccess: (updated) => {
      setFieldErrors({})
      if (asset && updated.display_name !== asset.display_name) {
        setBanner(t.assets.snChanged(asset.display_name, updated.display_name))
      } else {
        setBanner(t.assets.saved)
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
      navigate({ pathname: "/assets", search: location.search }, { replace: true })
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  const archived = Object.entries(asset?.archived_attrs ?? {})
  // Everything this device's category and model give it, in schema order --
  // including the derived number, which is as much a property of the device as
  // anything typed in.
  const shown = fieldsForModel(schema.data?.fields ?? [], asset?.model_id ?? null)
  const events = timeline.data ?? []
  const recent = events.slice(-5)

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-3xl">
        <StateBoundary
          isLoading={detail.isLoading}
          error={detail.error as Error | null}
          onRetry={() => detail.refetch()}
        >
          {asset && (
            <div className="grid gap-6">
              <DialogHeader>
                {/* pe-10 leaves room for the print button and, past it, the
                    dialog's own close button. */}
                <DialogTitle className="flex flex-wrap items-center gap-3 pe-10">
                  <span className="font-mono">{asset.display_name}</span>
                  <StatusBadge status={asset.status} />
                  {/* Printing is a property of the installation: with no
                      print service configured there is no button, the same
                      rule the list page's own print entries follow. */}
                  {canPrint && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      disabled={deniedReason("print") !== undefined}
                      title={deniedReason("print") ?? t.print.action}
                      onClick={() => setPrinting(true)}
                    >
                      <PrinterIcon data-icon="inline-start" />
                      {t.print.action}
                    </Button>
                  )}
                </DialogTitle>
              </DialogHeader>

              {printing && <PrintDialog ids={[id]} onClose={() => setPrinting(false)} />}

              {/* What this device is, before what can be done to it (015,
                  decision 104). Read-only and first: identity comes before
                  action, and reading it should not cost a click on an edit
                  form. The six built-ins are deliberately absent -- status,
                  holder, owner and note each already have their own place in
                  this dialog, and repeating them here would make two places
                  to look and two to keep right. */}
              <Card>
                <CardHeader>
                  <CardTitle>{t.assets.attrs}</CardTitle>
                </CardHeader>
                <CardContent>
                  {shown.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        {/* Two different reasons for an empty card, and
                            saying the wrong one sends someone to the category
                            page to add a field that is already there. */}
                        <EmptyDescription>
                          {(schema.data?.fields ?? []).length > 0
                            ? t.assets.noAttrsForModel
                            : t.assets.noAttrs}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                      {shown.map((f) => (
                        <div key={f.key}>
                          {/* The label names the row; the value is what
                              somebody opened this to read. */}
                          <dt className="text-muted-foreground text-[13px]">{f.label}</dt>
                          <dd
                            className={cn(
                              "mt-0.5 tabular-nums",
                              f.type === "computed" && "font-mono",
                            )}
                          >
                            {attrText(asset.attrs[f.key])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </CardContent>
              </Card>

              {banner && (
                <Alert role="status">
                  <InfoIcon />
                  <AlertDescription>{banner}</AlertDescription>
                </Alert>
              )}

              {/* Moving a device is what this system is for, so the form is
                  on screen rather than behind a button -- it used to be one
                  click further away than editing a field. */}
              <Card>
                <CardHeader>
                  <CardTitle>{tTransfer.actions.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {/* Where the device is now, and who answers for it. Stated
                      rather than editable: the form right below is how both of
                      them change, which the transfer card's own title already
                      says. */}
                  {/* A rule, not a box. This sits inside a card inside a
                      dialog, and a third border around it made three nested
                      frames saying the same thing -- the line is enough to
                      separate the state from the form that changes it. */}
                  <dl className="grid grid-cols-2 gap-3 border-b pb-4 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground text-[13px]">{t.assets.currentHolder}</dt>
                      <dd className="mt-0.5">{asset.holder.name ?? asset.holder.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-[13px]">{t.assets.currentOwner}</dt>
                      <dd className="mt-0.5">{asset.owner?.name ?? t.common.none}</dd>
                    </div>
                  </dl>

                  <TransferForm
                    assetIDs={[id]}
                    onDone={() => {
                      setBanner(tTransfer.actions.done(1))
                      queryClient.invalidateQueries({ queryKey: ["asset", id] })
                      queryClient.invalidateQueries({ queryKey: ["timeline", id] })
                    }}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t.assets.recentTransfers}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {editing && (
                    <EditEvent event={editing} assetID={id} onClose={() => setEditing(null)} />
                  )}
                  {/* The last few answer nearly every question anybody opens this
                  for. Forty events in a dialog is a page inside a box, with
                  one scrollbar inside another. */}
                  <Timeline
                    events={recent}
                    isLoading={timeline.isLoading}
                    error={timeline.error as Error | null}
                    editableId={tailID}
                    onEdit={setEditing}
                  />
                  {/* Offered whatever the length: somebody who came to read
                      the history should not have to notice that this card is
                      the short version of it. */}
                  <Button variant="outline" className="w-fit" asChild>
                    <Link to={`/assets/${id}/history`}>{t.assets.fullHistory}</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t.assets.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6">
                  {/* A sentence that belongs to the device and to no category's
                  schema: the scratch on the lid, the trial it is out on. It
                  sits with the built-ins because that is what it is. */}
                  <Field>
                    <FieldLabel htmlFor="asset-note">{t.assets.note}</FieldLabel>
                    <Textarea
                      id="asset-note"
                      rows={2}
                      value={note}
                      placeholder={t.assets.notePlaceholder}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>

                  {/* Behind a button: the model, the category's fields and the
                      home are edited once in a device's life, and they were
                      taking the room a movement should have. */}
                  <Collapsible>
                    {/* Beside the trigger, so it is readable before opening --
                        which is when someone is deciding whether to. */}
                    <div className="flex items-center gap-1.5">
                      <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-fit">
                        {t.assets.editAttrs}
                      </Button>
                      </CollapsibleTrigger>
                      <Hint>{t.assets.editAttrsHint}</Hint>
                    </div>
                    <CollapsibleContent className="grid gap-6 pt-4">
                      {/* Where it belongs when it is not out. Editable here rather
                    than on the entry form: a device's home changes when it is
                    relocated for good, which is an edit, not a recording. */}
                      <FieldSet>
                        <div className="mb-3 flex items-center gap-1.5">
                          <FieldLegend variant="label" className="mb-0">
                            {t.assets.home}
                          </FieldLegend>
                          <Hint>{t.assets.homeHint}</Hint>
                        </div>
                        {/* Boxed, because the fields underneath it are not part
                          of it: with everything at one indent the model and the
                          category's own fields read as more of the home. */}
                        <FieldGroup className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor="home-holder">{t.assets.homeHolder}</FieldLabel>
                            <Select value={homeID} onValueChange={setHomeID}>
                              <SelectTrigger id="home-holder">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value={NONE}>{t.assets.homeNone}</SelectItem>
                                  {(holders.data ?? []).map((h) => (
                                    <SelectItem key={h.id} value={h.id}>
                                      {h.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="home-owner">{t.assets.homeOwner}</FieldLabel>
                            <Select value={homeOwnerID} onValueChange={setHomeOwnerID}>
                              <SelectTrigger id="home-owner">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value={NONE}>{t.common.none}</SelectItem>
                                  {(users.data ?? [])
                                    .filter((u) => u.status === "active")
                                    .map((u) => (
                                      <SelectItem key={u.id} value={u.id}>
                                        {u.name}
                                      </SelectItem>
                                    ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                        </FieldGroup>
                      </FieldSet>

                      {/* The model and the category's own fields, under a legend
                        of their own so the group above them ends somewhere. */}
                      <FieldSet>
                        <FieldLegend variant="label">{t.assets.attrs}</FieldLegend>
                        <FieldGroup className="grid gap-4 rounded-md border p-4">
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
                              fields={fieldsForModel(schema.data.fields, asset.model_id)}
                              values={values}
                              errors={fieldErrors}
                              onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
                            />
                          )}
                        </FieldGroup>
                      </FieldSet>
                    </CollapsibleContent>
                  </Collapsible>

                  <div className="flex items-center gap-2">
                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                      {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                      {save.isPending ? t.assets.saving : t.assets.save}
                    </Button>
                    {/* At the far end, and it still asks for the number to be
                        typed out: near enough to find, far enough not to be
                        hit on the way to Save. */}
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="destructive"
                          className="ml-auto"
                          disabled={remove.isPending}
                        >
                          {t.assets.delete}
                        </Button>
                      }
                      title={t.assets.deleteTitle}
                      description={t.assets.deleteHint(asset.display_name)}
                      confirmLabel={t.assets.delete}
                      requirePhrase={asset.display_name}
                      onConfirm={() => remove.mutate()}
                    />
                  </div>
                </CardContent>
              </Card>

              {(detail.data?.value_history ?? []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t.assets.valueHistory}</CardTitle>
                    <CardDescription>{t.assets.valueHistoryHint}</CardDescription>
                  </CardHeader>
                  <CardContent>
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
                    <Button variant="outline">
                      {t.assets.archivedFields}（{archived.length}）
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <Card>
                      <CardHeader>
                        <CardDescription>{t.assets.archivedHint}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <dl className="grid gap-2 text-sm">
                          {archived.map(([k, v]) => (
                            <div key={k} className="flex gap-3">
                              <dt className="font-mono text-muted-foreground">{k}</dt>
                              <dd>{String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </CardContent>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </StateBoundary>
      </DialogContent>
    </Dialog>
  )
}
