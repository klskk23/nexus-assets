import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type Blocker, blockerKey } from "@/lib/api"
import {
  ALLOWED_PARENTS,
  PARENT_REQUIRED,
  type EntityType,
  type HolderEntity,
  type HolderUsage,
} from "@/lib/types"
import { NONE, fromNone, toNone } from "@/lib/select"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** What is standing in the way, as the server reported it. */
interface Refusal {
  message: string
  blockers: Blocker[]
  total: number
}

/**
 * A refusal with the devices behind it.
 *
 * One component because it is shown in two places -- above the table for a
 * row action, and inside the editor for a save -- and a refusal that lists its
 * blockers in one place and not the other would be the same bug twice.
 */
function RefusalAlert({ refusal }: { refusal: Refusal }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{tMeta.holders.blocked}</AlertTitle>
      <AlertDescription className="grid gap-1">
        {refusal.message}
        {refusal.blockers.length > 0 && (
          <>
            <p className="text-xs">{tMeta.holders.blockedBy}</p>
            <ul className="grid gap-0.5 font-mono text-xs">
              {refusal.blockers.map((b) => (
                <li key={blockerKey(b)}>{b.name}</li>
              ))}
              {refusal.total > refusal.blockers.length && (
                <li>{tMeta.holders.blockedMore(refusal.total)}</li>
              )}
            </ul>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function Holders() {
  const [name, setName] = useState("")
  const [type, setType] = useState<EntityType>("location")
  const [parentID, setParentID] = useState("")
  const [note, setNote] = useState("")
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()

  const [editing, setEditing] = useState<HolderEntity | null>(null)
  // Two refusals, deliberately separate: a row action has no dialog and shows
  // above the table, while a save happens with the editor open -- and the page
  // behind a dialog is aria-hidden and covered, so an alert out there is one
  // the operator can neither see nor hear.
  const [rowRefusal, setRowRefusal] = useState<Refusal | null>(null)
  const [saveRefusal, setSaveRefusal] = useState<Refusal | null>(null)

  // Read separately from CrudPage's own list so the form can offer parents and
  // resolve names; it is the same query key, so there is one fetch.
  const all = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
  })
  const holders = all.data ?? []
  const byID = new Map(holders.map((h) => [h.id, h]))

  // A department has to belong to a company, so with no company on file the
  // option is offered and disabled rather than silently missing -- "why is
  // 部门 not in the list" is a worse question than a greyed-out row with a
  // reason under it.
  const eligibleParents = holders.filter((h) => ALLOWED_PARENTS[type].includes(h.type))
  const hasCompany = holders.some((h) => h.type === "company")

  // What a delete would cost, fetched for every holder in one pass so the
  // confirm dialog can state it before the click rather than after.
  const usage = useQuery({
    queryKey: ["holders", "usage"],
    queryFn: async () => {
      const entries = await Promise.all(
        holders.map(
          async (h) => [h.id, await api.get<HolderUsage>(`/holders/${h.id}/usage`)] as const,
        ),
      )
      return Object.fromEntries(entries) as Record<string, HolderUsage>
    },
    enabled: holders.length > 0,
  })

  const invalidate = () => {
    setRowRefusal(null)
    queryClient.invalidateQueries({ queryKey: ["holders"] })
  }

  const refusalOf = (e: unknown): Refusal =>
    e instanceof ApiError
      ? { message: e.message, blockers: e.blockers ?? [], total: e.total ?? 0 }
      : { message: t.common.error, blockers: [], total: 0 }

  const save = useMutation({
    mutationFn: (h: HolderEntity) =>
      api.patch(`/holders/${h.id}`, {
        name: h.name,
        note: h.note,
        // Explicit null detaches; the field must be present either way, since
        // this dialog is where a parent gets cleared.
        parent_id: h.parent_id,
        // Only ever sent as true. The marker moves but does not switch off, so
        // false is refused by the server -- and sending it on every save would
        // turn "I renamed a warehouse" into that refusal.
        ...(h.is_default_stock ? { is_default_stock: true } : {}),
      }),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setSaveRefusal(null)
    },
    onError: (e) => setSaveRefusal(refusalOf(e)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/holders/${id}`),
    onSuccess: invalidate,
    onError: (e) => setRowRefusal(refusalOf(e)),
  })

  return (
    <>
      <EditDialog
        holder={editing}
        holders={holders}
        refusal={saveRefusal}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            setSaveRefusal(null)
          }
        }}
        onSave={(h) => save.mutate(h)}
        saving={save.isPending}
      />
      <CrudPage<HolderEntity>
        title={tMeta.holders.title}
        queryKey="holders"
        searchHint={tMeta.holders.searchHint}
        filterKeys={{ type: "", is_default_stock: "" }}
        filters={(qs) => (
          <HolderFilters
            type={qs.filters.type}
            stock={qs.filters.is_default_stock}
            onType={(v) => qs.setFilter("type", v)}
            onStock={(v) => qs.setFilter("is_default_stock", v)}
          />
        )}
        list={(params) => api.get<ListPage<HolderEntity>>(`/holders?${params}`)}
        createLabel={tMeta.holders.create}
        // Setting the default stock marker is a row action, so its refusal
        // belongs beside the rows -- not inside the create dialog.
        notice={rowRefusal && <RefusalAlert refusal={rowRefusal} />}
        onRowClick={(h) => setEditing(h)}
      rowActions={[
        { label: tMeta.holders.edit, onSelect: (h) => setEditing(h) },
        {
          label: tMeta.holders.delete,
          destructive: true,
          onSelect: (h) => remove.mutate(h.id),
          confirm: (h) => {
            const u = usage.data?.[h.id]
            return {
              title: tMeta.holders.deleteTitle,
              description:
                u && u.history > 0
                  ? tMeta.holders.deleteHistoryHint(h.name, u.history)
                  : tMeta.holders.deleteHint(h.name),
              phrase: h.name,
            }
          },
        },
      ]}
      createDeniedReason={deniedReason("holder.create")}
      createDisabled={name === "" || (PARENT_REQUIRED[type] && parentID === "")}
        onCreated={() => {
          setName("")
          setType("location")
          setParentID("")
          setNote("")
        }}
        create={() => api.post("/holders", { type, name, note, parent_id: parentID || null })}
        emptyTitle={tMeta.holders.empty}
        emptyHint={tMeta.holders.emptyHint}
        columns={[
          { header: tMeta.holders.name, cell: (h) => h.name },
          { header: tMeta.holders.type, cell: (h) => tMeta.entityTypes[h.type] ?? h.type },
          {
            header: tMeta.holders.parent,
            cell: (h) =>
              h.parent_id ? (
                (byID.get(h.parent_id)?.name ?? h.parent_id)
              ) : (
                <span className="text-muted-foreground">{tMeta.holders.noParent}</span>
              ),
          },
          {
            header: tMeta.holders.note,
            cell: (h) => <span className="text-muted-foreground text-sm">{h.note}</span>,
          },
          {
            header: tMeta.holders.defaultStock,
            // Shown, not operated. A control inside a clickable row fires the
            // row's handler too, so pressing it also opened the editor -- two
            // things happening from one click, one of them unasked for.
            cell: (h) => (h.is_default_stock ? <Badge>{tMeta.holders.defaultStock}</Badge> : null),
          },
        ]}
        form={
          <FieldGroup className="sm:grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="h-name">{tMeta.holders.name}</FieldLabel>
              <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="h-type">{tMeta.holders.type}</FieldLabel>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as EntityType)
                  // The eligible parents differ per kind, so a carried-over
                  // choice would be one the server is about to refuse.
                  setParentID("")
                }}
              >
                <SelectTrigger id="h-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(tMeta.entityTypes).map(([k, v]) => (
                      <SelectItem key={k} value={k} disabled={k === "department" && !hasCompany}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {type === "department" && !hasCompany && (
                <FieldDescription>{tMeta.holders.noCompanyYet}</FieldDescription>
              )}
            </Field>

            {ALLOWED_PARENTS[type].length > 0 && (
              <Field>
                <FieldLabel htmlFor="h-parent">{tMeta.holders.parent}</FieldLabel>
                <Select value={toNone(parentID)} onValueChange={(v) => setParentID(fromNone(v))}>
                  <SelectTrigger id="h-parent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {/* A department has no "no parent" option: the rule is not
                        a suggestion, and offering the choice would only lead
                        to a refusal. */}
                      {!PARENT_REQUIRED[type] && (
                        <SelectItem value={NONE}>{tMeta.holders.noParent}</SelectItem>
                      )}
                      {eligibleParents.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}（{tMeta.entityTypes[h.type] ?? h.type}）
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {PARENT_REQUIRED[type] && (
                  <FieldDescription>
                    {tMeta.holders.parentRequired(
                      tMeta.entityTypes[type] ?? type,
                      ALLOWED_PARENTS[type].map((p) => tMeta.entityTypes[p] ?? p),
                    )}
                  </FieldDescription>
                )}
              </Field>
            )}

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="h-note">{tMeta.holders.note}</FieldLabel>
              <Input
                id="h-note"
                value={note}
                placeholder={tMeta.holders.notePlaceholder}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </FieldGroup>
        }
      />
    </>
  )
}

interface EditProps {
  holder: HolderEntity | null
  holders: HolderEntity[]
  refusal: Refusal | null
  onOpenChange: (open: boolean) => void
  onSave: (h: HolderEntity) => void
  saving: boolean
}

/**
 * Edits one holder.
 *
 * The type is not editable: changing a company into a location would leave its
 * children pointing at a parent kind the rules forbid, and there is no answer
 * to what should happen to them that the operator has agreed to. Delete and
 * recreate says the same thing out loud.
 */
function EditDialog({ holder, holders, refusal, onOpenChange, onSave, saving }: EditProps) {
  const [draft, setDraft] = useState<HolderEntity | null>(holder)

  // The row is the source of truth; opening on a different one replaces the
  // draft rather than showing the last thing that was edited.
  if (holder?.id !== draft?.id) setDraft(holder)
  if (!draft) return null

  const eligible = holders.filter(
    (h) => h.id !== draft.id && ALLOWED_PARENTS[draft.type].includes(h.type),
  )

  return (
    <Dialog open={holder !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tMeta.holders.editTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="he-name">{tMeta.holders.name}</FieldLabel>
            <Input
              id="he-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>

          {ALLOWED_PARENTS[draft.type].length > 0 && (
            <Field>
              <FieldLabel htmlFor="he-parent">{tMeta.holders.parent}</FieldLabel>
              <Select
                value={toNone(draft.parent_id ?? "")}
                onValueChange={(v) => setDraft({ ...draft, parent_id: fromNone(v) || null })}
              >
                <SelectTrigger id="he-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {!PARENT_REQUIRED[draft.type] && (
                      <SelectItem value={NONE}>{tMeta.holders.noParent}</SelectItem>
                    )}
                    {eligible.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}（{tMeta.entityTypes[h.type] ?? h.type}）
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="he-note">{tMeta.holders.note}</FieldLabel>
            <Input
              id="he-note"
              value={draft.note}
              placeholder={tMeta.holders.notePlaceholder}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>

          {/* Only a location can hold the marker, and the one that has it has
              nowhere to move it to -- so it is ticked and locked rather than
              hidden, which would leave "where did it go" unanswered. */}
          {draft.type === "location" && (
            <Field orientation="horizontal">
              <Checkbox
                id="he-default"
                checked={draft.is_default_stock}
                disabled={holder?.is_default_stock}
                onCheckedChange={(v) => setDraft({ ...draft, is_default_stock: v === true })}
              />
              <FieldLabel htmlFor="he-default">{tMeta.holders.setDefault}</FieldLabel>
            </Field>
          )}
          {draft.type === "location" && (
            <FieldDescription>{tMeta.holders.defaultStockHint}</FieldDescription>
          )}

          {refusal && <RefusalAlert refusal={refusal} />}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button disabled={draft.name === "" || saving} onClick={() => onSave(draft)}>
            {tMeta.holders.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Kind, and whether it is the one place returns go to when nobody says. */
function HolderFilters({
  type,
  stock,
  onType,
  onStock,
}: {
  type: string
  stock: string
  onType: (v: string) => void
  onStock: (v: string) => void
}) {
  return (
    <>
      <Field className="w-auto">
        <FieldLabel htmlFor="h-type-filter" className="sr-only">
          {tMeta.holders.type}
        </FieldLabel>
        <Select value={toNone(type)} onValueChange={(v) => onType(fromNone(v))}>
          <SelectTrigger id="h-type-filter" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NONE}>{tMeta.holders.allTypes}</SelectItem>
              {(["company", "department", "location"] as const).map((k) => (
                <SelectItem key={k} value={k}>
                  {tMeta.entityTypes[k]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field className="w-auto">
        <FieldLabel htmlFor="h-stock-filter" className="sr-only">
          {tMeta.holders.defaultStock}
        </FieldLabel>
        <Select value={toNone(stock)} onValueChange={(v) => onStock(fromNone(v))}>
          <SelectTrigger id="h-stock-filter" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NONE}>{tMeta.holders.anyStock}</SelectItem>
              <SelectItem value="true">{tMeta.holders.defaultStock}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}
