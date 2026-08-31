import { AlertCircleIcon, PencilIcon, Trash2Icon } from "lucide-react"
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
import { t, tMeta } from "@/i18n"
import { CrudPage } from "@/features/metadata/CrudPage"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
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

export function Holders() {
  const [name, setName] = useState("")
  const [type, setType] = useState<EntityType>("location")
  const [parentID, setParentID] = useState("")
  const [note, setNote] = useState("")
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<HolderEntity | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  // The server has attached the blocking devices since the first version; the
  // client used to parse only `referrers` and drop these on the floor, leaving
  // the page with a count and no way to act on it.
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [blockerTotal, setBlockerTotal] = useState(0)

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
    setBanner(null)
    setBlockers([])
    queryClient.invalidateQueries({ queryKey: ["holders"] })
  }

  const fail = (e: unknown) => {
    if (e instanceof ApiError) {
      setBanner(e.message)
      setBlockers(e.blockers ?? [])
      setBlockerTotal(e.total ?? 0)
    } else {
      setBanner(t.common.error)
    }
  }

  const save = useMutation({
    mutationFn: (h: HolderEntity) =>
      api.patch(`/holders/${h.id}`, {
        name: h.name,
        note: h.note,
        // Explicit null detaches; the field must be present either way, since
        // this dialog is where a parent gets cleared.
        parent_id: h.parent_id,
      }),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/holders/${id}`),
    onSuccess: invalidate,
    onError: fail,
  })

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/holders/${id}`, { is_default_stock: true }),
    onSuccess: invalidate,
    onError: fail,
  })

  return (
    <>
      <EditDialog
        holder={editing}
        holders={holders}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(h) => save.mutate(h)}
        saving={save.isPending}
      />
      <CrudPage<HolderEntity>
        title={tMeta.holders.title}
        queryKey="holders"
        list={() => api.get<HolderEntity[]>("/holders")}
        createLabel={tMeta.holders.create}
        // Setting the default stock marker is a row action, so its refusal
        // belongs beside the rows -- not inside the create dialog.
        notice={
          banner && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{tMeta.holders.blocked}</AlertTitle>
              <AlertDescription className="grid gap-1">
                {banner}
                {blockers.length > 0 && (
                  <>
                    <p className="text-xs">{tMeta.holders.blockedBy}</p>
                    <ul className="grid gap-0.5 font-mono text-xs">
                      {blockers.map((b) => (
                        <li key={blockerKey(b)}>{b.name}</li>
                      ))}
                      {blockerTotal > blockers.length && (
                        <li>{tMeta.holders.blockedMore(blockerTotal)}</li>
                      )}
                    </ul>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )
        }
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
            header: t.common.actions,
            cell: (h) => {
              const u = usage.data?.[h.id]
              return (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(h)}>
                    <PencilIcon data-icon="inline-start" />
                    {tMeta.holders.edit}
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="text-destructive">
                        <Trash2Icon data-icon="inline-start" />
                        {tMeta.holders.delete}
                      </Button>
                    }
                    title={tMeta.holders.deleteTitle}
                    // History only degrades the timeline, so it is stated rather
                    // than used to refuse.
                    description={
                      u && u.history > 0
                        ? tMeta.holders.deleteHistoryHint(h.name, u.history)
                        : tMeta.holders.deleteHint(h.name)
                    }
                    confirmLabel={tMeta.holders.delete}
                    requirePhrase={h.name}
                    onConfirm={() => remove.mutate(h.id)}
                  />
                </div>
              )
            },
          },
          {
            header: tMeta.holders.defaultStock,
            // The marker moves but never switches off, so the current holder gets
            // a badge with no control rather than a toggle that would be refused.
            cell: (h) =>
              h.is_default_stock ? (
                <Badge>{tMeta.holders.defaultStock}</Badge>
              ) : h.type === "location" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={setDefault.isPending}
                  onClick={() => setDefault.mutate(h.id)}
                >
                  {tMeta.holders.setDefault}
                </Button>
              ) : null,
          },
        ]}
        form={
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        }
      />
    </>
  )
}

interface EditProps {
  holder: HolderEntity | null
  holders: HolderEntity[]
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
function EditDialog({ holder, holders, onOpenChange, onSave, saving }: EditProps) {
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
