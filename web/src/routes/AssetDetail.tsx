import { ArrowLeftIcon, InfoIcon, PrinterIcon } from "lucide-react"
import { Hint } from "@/features/common/Hint"
import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { cn } from "cn"
import { api, ApiError, type FieldErrors } from "@/lib/api"
import type { Asset, CategorySchema, HolderEntity, User } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { NONE } from "@/lib/select"
import type { Transfer } from "@/lib/transferTypes"
import { t, tAudit, tTransfer } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { SearchSelect } from "@/features/common/SearchSelect"
import { StateBoundary } from "@/components/StateBoundary"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { attrText, fieldsForModel } from "@/features/assets/modelFields"
import { TransferChange } from "@/features/transfers/TransferChange"
import { TableFrame } from "@/features/common/TableFrame"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EditEvent } from "@/features/transfers/EditEvent"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { ModelPicker } from "@/features/assets/ModelPicker"
import { PrintDialog } from "@/features/print/PrintDialog"
import { usePrinting } from "@/features/print/usePrinting"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TransferDialog } from "@/features/transfers/TransferDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"

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
  const queryClient = useQueryClient()

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
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

  // With the device's model, for the reason above: since 026 a model's fields
  // are reached by asking about the device, not by asking its category.
  const schema = useQuery({
    queryKey: ["schema", asset?.category_id, asset?.model_id],
    queryFn: () =>
      api.get<CategorySchema>(
        `/categories/${asset!.category_id}/schema${
          asset!.model_id ? `?model_id=${asset!.model_id}` : ""
        }`,
      ),
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
      // Close first, then announce. The banner lives on the page, and a modal
      // marks everything behind it aria-hidden -- announcing into that is
      // announcing to nobody, and the person is left looking at the form they
      // just submitted with no sign it worked. Failures do the opposite and
      // stay: the dialog is where the field with the error is.
      setEditOpen(false)
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
        const fields = err.fields ?? {}
        setFieldErrors(fields)
        // A stale version is not something to retry silently: someone else's
        // edit would be overwritten. Say so and make the user reload.
        setBanner(err.message)
        // Where the message can be read decides where the dialog goes. A
        // field-level rejection is readable beside the input that caused it,
        // so the form stays open on it. Anything about the record as a whole
        // -- a stale version, a refused permission -- has nowhere to sit in
        // the form, and its banner is on the page, which a modal hides.
        if (Object.keys(fields).length === 0) setEditOpen(false)
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
  // Same query key ModelPicker uses, so opening the edit form does not refetch.
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  const model = (models.data ?? []).find((m) => m.id === asset?.model_id)

  const shown = fieldsForModel(schema.data?.fields ?? [], asset?.model_id ?? null)
  const events = timeline.data ?? []

  return (
    <div className="grid gap-14">
      {/* Back, and it always goes to the list -- not wherever the browser
          happened to come from. Someone who arrived from a scan, from
          finishing a form, or from the audit's "just this object" is on this
          page to read a device, and the list is the place that answers "which
          other ones". The list's filters ride along in this page's own query
          string, so handing them back is handing back what we were given.
          Nothing to restore, nothing to remember, and it survives a refresh. */}
      <Button variant="outline" size="sm" className="w-fit" asChild>
        <Link to={{ pathname: "/assets", search: location.search }}>
          <ArrowLeftIcon />
          {t.assets.title}
        </Link>
      </Button>
      <div>
        <StateBoundary
          isLoading={detail.isLoading}
          error={detail.error as Error | null}
          onRetry={() => detail.refetch()}
        >
          {asset && (
            <div className="grid gap-14">
              <header className="grid gap-2">
                {/* pe-10 leaves room for the print button and, past it, the
                    dialog's own close button. */}
                {/* The one heading on this product that IS Latin: a device
                    number. font-heading was taken off the Chinese page titles
                    because Caprasimo renders none of those glyphs -- here it
                    renders all of them, so this is where it belongs.
                    A page title, not a number in a cell: the same number set
                    inside a table stays plain, because there it is a value to
                    match character by character rather than the name of the
                    page you are on. Tabular figures either way. */}
                {/* The number and the verbs share a line: the number is what
                    you came to identify, the buttons are what you came to do,
                    and on a page this wide keeping them apart left a band of
                    nothing between them. They wrap under on a narrow panel,
                    which is the only width where the row cannot hold both. */}
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <h1 className="flex flex-wrap items-center gap-3 text-[40px] leading-[1.2] font-bold">
                    <span className="font-heading tabular-nums">{asset.display_name}</span>
                    <StatusBadge status={asset.status} />
                  </h1>
                  {/* Everything you can DO to this device, in one row, ordered by
                    how often it is done: label it, correct it, move it. The page
                    below is what the device IS; these are the verbs, and keeping
                    them together is what lets the reading part stay readable.

                    Moving is the primary because it is why this system exists.
                    The other two are outlines -- printing is occasional, editing
                    happens about once in a device's life. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {canPrint && (
                      <Button
                        variant="outline"
                        disabled={deniedReason("print") !== undefined}
                        title={deniedReason("print") ?? t.print.action}
                        onClick={() => setPrinting(true)}
                      >
                        <PrinterIcon />
                        {t.print.action}
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                      {t.assets.editAttrs}
                    </Button>
                    <Button onClick={() => setTransferOpen(true)}>{tTransfer.actions.title}</Button>
                  </div>
                </div>
                {/* Data, not prose. The mock had a sentence here explaining how
                    the number is derived -- that belongs to the entry form,
                    where somebody is deciding whether to type one. No model, no
                    line; model without a vendor, no separator left hanging. */}
                {model && (
                  <p className="text-muted-foreground text-sm">
                    {[model.name, model.vendor_name].filter(Boolean).join(" · ")}
                  </p>
                )}
              </header>

              {printing && <PrintDialog ids={[id]} onClose={() => setPrinting(false)} />}

              {/* Four facts that answer "where is it and whose is it" without
                  opening anything. They used to sit inside the transfer card,
                  which meant reading them cost finding the form that changes
                  them. On --card because this band is the one raised thing on
                  a page that is otherwise flat. */}
              <dl className="bg-card grid gap-x-6 gap-y-5 rounded-[28px] px-8 py-6 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-[13px]">{t.assets.currentHolder}</dt>
                  <dd className="mt-1">{asset.holder.name ?? asset.holder.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[13px]">{t.assets.currentOwner}</dt>
                  <dd className="mt-1">{asset.owner?.name ?? t.common.none}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[13px]">{t.assets.home}</dt>
                  <dd className="mt-1">{asset.home_holder?.name ?? t.assets.homeNone}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[13px]">{t.assets.createdAt}</dt>
                  <dd className="mt-1 tabular-nums">{asset.created_at.slice(0, 10)}</dd>
                </div>
              </dl>

              {/* The device's own note, read where the device is read.
                  Editable in the dialog, as everything on this page is, but
                  reading it should not cost opening the form that changes it
                  -- which is the same argument 015 decision 104 made about the
                  attributes below. A sentence gets its own line rather than a
                  cell in the band above. */}
              {asset.note && (
                <p className="text-muted-foreground -mt-8 text-sm">{asset.note}</p>
              )}

              {/* What this device is, before what can be done to it (015,
                  decision 104). Read-only: editing is a button in the header
                  now, so this section has one job and does it without a form
                  in the way. Two columns of rows rather than four columns of
                  pairs -- a value belongs beside its label, and at four across
                  a long value wrapped under a short one and stopped looking
                  like a pair at all.

                  The badge on the right says why a value is the way it is:
                  unique, inherited from somewhere else, or computed and
                  therefore not typed by anyone. */}
              <section aria-label={t.assets.attrs} className="grid content-start gap-3">
                <h2 className="text-[21px] leading-tight font-bold">{t.assets.attrs}</h2>
                {shown.length === 0 ? (
                  <div className="bg-well rounded-[28px] p-6">
                    <Empty>
                      <EmptyHeader>
                        {/* Two different reasons for an empty card, and saying
                            the wrong one sends someone to the category page to
                            add a field that is already there. */}
                        <EmptyDescription>
                          {(schema.data?.fields ?? []).length > 0
                            ? t.assets.noAttrsForModel
                            : t.assets.noAttrs}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : (
                  <dl className="grid gap-x-12 text-sm sm:grid-cols-2">
                    {shown.map((f) => (
                      <div
                        key={f.key}
                        className="border-border-muted flex items-center gap-4 border-b py-4"
                      >
                        <dt className="text-muted-foreground w-32 shrink-0">{f.label}</dt>
                        <dd
                          className={cn(
                            "min-w-0 flex-1 break-words tabular-nums",
                            f.type === "computed" && "font-mono",
                          )}
                        >
                          {attrText(asset.attrs[f.key])}
                        </dd>
                        {/* At most one: computed is the strongest thing to say
                            about a value, then that it must be unique, then
                            where it came from. Three badges on one row would
                            be a legend, not a label. */}
                        {f.type === "computed" ? (
                          <Badge variant="outline">{t.common.computed}</Badge>
                        ) : f.is_unique ? (
                          <Badge variant="outline">{t.common.unique}</Badge>
                        ) : f.inherited_from ? (
                          <Badge variant="outline">{t.common.inherited}</Badge>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                )}
              </section>

              {banner && (
                <Alert role="status">
                  <InfoIcon />
                  <AlertDescription>{banner}</AlertDescription>
                </Alert>
              )}

              <section aria-label={t.assets.transfers} className="grid content-start gap-3">
                <h2 className="text-[21px] leading-tight font-bold">{t.assets.transfers}</h2>
                <div className="grid gap-4">
                  {editing && (
                    <EditEvent event={editing} assetID={id} onClose={() => setEditing(null)} />
                  )}
                  {/* A table, like every other list here. No asset column: the
                      whole page is one device, and a column repeating its
                      number forty times says nothing forty times.

                      Correcting goes in the right-click menu rather than a
                      button in the cell -- a control inside a row fires with
                      the row, and one click gives two results. Only the last
                      event can be corrected, and the item for the others is
                      disabled rather than absent: somebody who cannot see it
                      cannot learn it exists. */}
                  <TableFrame>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tAudit.when}</TableHead>
                          <TableHead>{tAudit.change}</TableHead>
                          <TableHead>{tAudit.actor}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.map((ev) => (
                          <ContextMenu key={ev.id}>
                            <ContextMenuTrigger asChild>
                              <TableRow>
                                <TableCell className="whitespace-nowrap">
                                  {new Date(ev.created_at).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  <TransferChange event={ev} />
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {ev.actor?.name ?? t.common.none}
                                </TableCell>
                              </TableRow>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                disabled={ev.id !== tailID}
                                onSelect={() => setEditing(ev)}
                              >
                                {tTransfer.editTail}
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        ))}
                      </TableBody>
                    </Table>
                  </TableFrame>
                </div>
              </section>

              {/* Moving, behind the primary button. Not a page of its own:
                  a move is two or three fields and a note, it is done from the
                  device you are already looking at, and when it lands the state
                  and the new event are both on the page behind the dialog. An
                  address would have bought nothing and cost a navigation. */}
              <TransferDialog
                assetIDs={[id]}
                open={transferOpen}
                onOpenChange={setTransferOpen}
                onDone={(n) => {
                  setBanner(tTransfer.actions.done(n))
                  queryClient.invalidateQueries({ queryKey: ["asset", id] })
                  queryClient.invalidateQueries({ queryKey: ["timeline", id] })
                }}
              />

              {/* Editing behind a button, not a section on the page.
                  A device's model, home and field values are set about once in
                  its life; on the page they were taking the room that reading
                  the device should have, and every visit paid for an edit that
                  almost never happens. The Collapsible that used to hide half
                  of it is gone with the section -- a dialog is already the
                  "not now" state, and two layers of hiding is one too many. */}
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{t.assets.editAttrs}</DialogTitle>
                    <DialogDescription>{t.assets.editAttrsHint}</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-6">
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

                    {/* No second layer of hiding. This used to be a
                      Collapsible on the page, because the model, the home and
                      the category's fields were taking the room a movement
                      should have had. The dialog already IS the "not now"
                      state, so folding things inside it only meant two clicks
                      to reach what the dialog was opened for. */}
                    <>
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
                            {/* Searchable: holders grow without bound. */}
                            <SearchSelect
                              id="home-holder"
                              value={homeID === NONE ? "" : homeID}
                              onChange={(v) => setHomeID(v === "" ? NONE : v)}
                              placeholder={t.assets.homeNone}
                              options={(holders.data ?? []).map((h) => ({
                                value: h.id,
                                label: h.name,
                              }))}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="home-owner">{t.assets.homeOwner}</FieldLabel>
                            <SearchSelect
                              id="home-owner"
                              value={homeOwnerID === NONE ? "" : homeOwnerID}
                              onChange={(v) => setHomeOwnerID(v === "" ? NONE : v)}
                              placeholder={t.common.none}
                              options={(users.data ?? [])
                                .filter((u) => u.status === "active")
                                .map((u) => ({ value: u.id, label: u.name }))}
                            />
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
                    </>

                    <DialogFooter>
                      <Button onClick={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending && <Spinner aria-hidden />}
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
                        tone="danger"
                        requirePhrase={asset.display_name}
                        onConfirm={() => remove.mutate()}
                      />
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>

              {(detail.data?.value_history ?? []).length > 0 && (
                <section aria-label={t.assets.valueHistory} className="grid content-start gap-3">
                  <div className="grid gap-1">
                    <h2 className="text-[21px] leading-tight font-bold">{t.assets.valueHistory}</h2>
                    <p className="text-sm text-muted-foreground">{t.assets.valueHistoryHint}</p>
                  </div>
                  <div className="bg-well rounded-[20px] p-6">
                    <ul className="grid gap-1 font-mono text-sm">
                      {(detail.data?.value_history ?? []).map((h, i) => (
                        <li key={i}>
                          {h.key}: {h.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}

              {/* A card, not a fold. These values are the reason a device shows
                  a field its category no longer has; hiding the explanation
                  behind a click leaves the odd thing visible and the reason for
                  it not. Chips because each is one short fact -- name and
                  value -- and a list of two-word rows was a table pretending to
                  be prose. */}
              {archived.length > 0 && (
                <section
                  aria-label={t.assets.archivedFields}
                  className="bg-card grid content-start gap-3 rounded-[28px] px-8 py-6"
                >
                  <div className="grid gap-1">
                    <h2 className="text-base font-bold">{t.assets.archivedFields}</h2>
                    <p className="text-muted-foreground text-sm">{t.assets.archivedHint}</p>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {archived.map(([k, v]) => (
                      <li key={k} className="bg-background rounded-full border px-3 py-1.5 text-sm">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="text-muted-foreground/60 px-1.5">·</span>
                        <span className="tabular-nums">{String(v)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </StateBoundary>
      </div>
    </div>
  )
}
