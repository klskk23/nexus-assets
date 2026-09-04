import { AlertCircleIcon } from "lucide-react"
import { Hint } from "@/features/common/Hint"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { AssetStatus, HolderEntity, User } from "@/lib/types"
import type { TransferResult } from "@/lib/transferTypes"
import { t, tTransfer } from "@/i18n"
import { useStatuses } from "@/features/statuses/useStatuses"
import { useAuth } from "@/features/auth/useAuth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type TransferAction = "checkout" | "checkin" | "transfer" | "reassign" | "status"

/** "leave the owner alone". Radix reserves the empty string. */
const KEEP = "__keep"

/** "each device goes back to its own home" -- the default for a check-in. */
const HOME = "__home"

/**
 * The actions, in the order they are offered.
 *
 * A function rather than a constant: a module-level array is evaluated once at
 * import time, and would still be holding the labels of whatever language the
 * page was first loaded in.
 */
export function transferActions(): [TransferAction, string][] {
  return [
    ["checkout", tTransfer.actions.checkout],
    ["checkin", tTransfer.actions.checkin],
    ["transfer", tTransfer.actions.transfer],
    ["reassign", tTransfer.actions.reassign],
    ["status", tTransfer.actions.changeStatus],
  ]
}

interface Props {
  assetIDs: string[]
  /** Preselects an action; the list page passes the button that was clicked. */
  initialAction?: TransferAction | null
  /**
   * Whether this form is on screen. The dialog passes its own open state, so
   * reopening with a different button does not show the previous choice; the
   * asset dialog leaves it true, because it is always on screen there.
   */
  active?: boolean
  onDone: (count: number) => void
  /** Sits beside the submit button. The dialog puts its Cancel there. */
  cancel?: ReactNode
}

/**
 * The one place a transfer is composed.
 *
 * Three surfaces show this: the list page's action bar with the clicked action
 * preselected, a row's context menu, and the asset dialog, where it is the
 * main thing on screen rather than behind a button -- moving a device is what
 * this system is for, and it was one click further away than editing a field.
 *
 * The request is identical on all of them -- a single asset is just a
 * one-element batch -- so they cannot drift apart in behaviour.
 */
export function TransferForm({
  assetIDs,
  initialAction = null,
  active = true,
  onDone,
  cancel,
}: Props) {
  const queryClient = useQueryClient()
  const statuses = useStatuses()
  const { user } = useAuth()
  const [action, setAction] = useState<TransferAction | null>(initialAction ?? null)
  const [holderType, setHolderType] = useState<"user" | "entity">("user")
  const [holderID, setHolderID] = useState("")
  const [ownerID, setOwnerID] = useState("")
  // Who is answerable for the device after this move.
  //
  // Handing it to a person answers the question by itself. Handing it to a
  // company, a department or a warehouse does not -- somebody still has to be
  // the one you ask about it -- so those cases get a picker, defaulted to
  // whoever is doing the handing.
  const [responsibleID, setResponsibleID] = useState(KEEP)
  const [status, setStatus] = useState<AssetStatus>("in_repair")
  const [note, setNote] = useState("")
  const [banner, setBanner] = useState<string | null>(null)

  // Reopening with a different button must not show the previous choice.
  const reset = useCallback(
    (to: TransferAction | null) => {
      setAction(to)
      setBanner(null)
      // Check-in defaults to leaving both alone: each device's own home
      // already answers where and who, which is the point of having one.
      setResponsibleID(to === "checkin" ? KEEP : (user?.id ?? KEEP))
      setHolderID(to === "checkin" ? HOME : "")
      setOwnerID("")
    },
    [user?.id],
  )

  useEffect(() => {
    if (active) reset(initialAction ?? null)
  }, [active, initialAction, reset])

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: active,
  })
  const holders = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
    enabled: active,
  })

  const submit = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { asset_ids: assetIDs, note }
      switch (action) {
        case "checkout":
          body.to_status = "in_use"
          body.to_holder_type = holderType
          body.to_holder_id = holderID
          if (needsResponsible && responsibleID !== KEEP) body.to_owner_id = responsibleID
          break
        case "checkin":
          body.to_status = "in_stock"
          // No destination named: each device goes back to its own home, and
          // the server says so if one has neither a home nor a global default
          // rather than failing opaquely.
          body.check_in = true
          if (holderID !== HOME) {
            body.to_holder_type = "entity"
            body.to_holder_id = holderID
          }
          if (responsibleID !== KEEP) body.to_owner_id = responsibleID
          break
        case "transfer":
          body.to_holder_type = holderType
          body.to_holder_id = holderID
          if (needsResponsible && responsibleID !== KEEP) body.to_owner_id = responsibleID
          break
        case "reassign":
          body.to_owner_id = ownerID
          break
        case "status":
          body.to_status = status
          break
      }
      return api.post<TransferResult>("/transfers", body)
    },
    onSuccess: (res) => {
      setBanner(null)
      setNote("")
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      queryClient.invalidateQueries({ queryKey: ["asset"] })
      queryClient.invalidateQueries({ queryKey: ["transfers"] })
      onDone(res.transfers.length)
      // Back to no action chosen. The dialog closes on top of this, but the
      // asset dialog keeps the form on screen, and a submitted choice left
      // selected is one stray click away from recording the same move twice.
      reset(null)
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  const needsHolder = action === "checkout" || action === "transfer"
  // Check-in always lands on an entity -- the default stock point -- so it
  // asks too, without a holder picker of its own.
  const needsResponsible = (needsHolder && holderType === "entity") || action === "checkin"
  const canSubmit =
    action !== null &&
    (!needsHolder || holderID !== "") &&
    (action !== "reassign" || ownerID !== "")

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="td-action">{tTransfer.actions.action}</FieldLabel>
        <ToggleGroup
          id="td-action"
          type="single"
          variant="outline"
          className="justify-start"
          value={action ?? ""}
          onValueChange={(v) => {
            const next = (v || null) as TransferAction | null
            setAction(next)
            // Check-in starts on "each device's own home"; the others
            // start unset, so submit stays disabled until one is picked.
            setHolderID(next === "checkin" ? HOME : "")
            // And it leaves the owner alone, because the home already
            // answers who is responsible once the device is back.
            setResponsibleID(next === "checkin" ? KEEP : (user?.id ?? KEEP))
          }}
        >
          {transferActions().map(([a, label]) => (
            <ToggleGroupItem key={a} value={a} aria-label={label}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      {action === "checkin" && (
        <Field>
          <div className="flex items-center gap-1.5">
            <FieldLabel htmlFor="td-checkin-holder">{tTransfer.actions.target}</FieldLabel>
            <Hint>{tTransfer.actions.checkinHint}</Hint>
          </div>
          <Select value={holderID} onValueChange={setHolderID}>
            <SelectTrigger id="td-checkin-holder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {/* The default, and the only option that can differ per
                    device in a batch. */}
                <SelectItem value={HOME}>{tTransfer.actions.toHome}</SelectItem>
                {(holders.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}

      {needsHolder && (
        <>
          <Field>
            <FieldLabel htmlFor="td-holder-type">{tTransfer.actions.target}</FieldLabel>
            <Select
              value={holderType}
              onValueChange={(v) => {
                setHolderType(v as "user" | "entity")
                setHolderID("")
              }}
            >
              <SelectTrigger id="td-holder-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="user">{t.common.user}</SelectItem>
                  <SelectItem value="entity">{t.common.entityGroup}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="td-holder">
              {holderType === "user" ? t.common.user : t.common.holder}
            </FieldLabel>
            <Select value={holderID} onValueChange={setHolderID}>
              <SelectTrigger id="td-holder">
                <SelectValue placeholder={t.common.select} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(holderType === "user" ? (users.data ?? []) : (holders.data ?? [])).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}

      {needsResponsible && (
        <Field>
          <div className="flex items-center gap-1.5">
            <FieldLabel htmlFor="td-responsible">{tTransfer.actions.owner}</FieldLabel>
            <Hint>{tTransfer.actions.ownerHint}</Hint>
          </div>
          <Select value={responsibleID} onValueChange={setResponsibleID}>
            <SelectTrigger id="td-responsible">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {/* Leaving it alone has to be sayable: a warehouse-to-
                    warehouse move need not change who is answerable. */}
                <SelectItem value={KEEP}>{tTransfer.actions.keepOwner}</SelectItem>
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
      )}

      {action === "reassign" && (
        <Field>
          <FieldLabel htmlFor="td-owner">{tTransfer.actions.owner}</FieldLabel>
          <Select value={ownerID} onValueChange={setOwnerID}>
            <SelectTrigger id="td-owner">
              <SelectValue placeholder={t.common.select} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(users.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}

      {action === "status" && (
        <Field>
          <FieldLabel htmlFor="td-status">{tTransfer.actions.status}</FieldLabel>
          <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
            <SelectTrigger id="td-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {statuses.statuses.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="td-note">{tTransfer.actions.note}</FieldLabel>
        {/* The asset dialog shows this form beside the device's own note, and
            the two are different things: this one belongs to the movement and
            is never edited afterwards. That is said in the box, the way the
            device's own note says it -- two note boxes one above the other,
            and only one of them explaining itself, was the confusing half. */}
        <Input
          id="td-note"
          value={note}
          placeholder={tTransfer.actions.noteHint}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {banner && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        {cancel}
        <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending && <Spinner data-icon="inline-start" aria-hidden />}
          {submit.isPending ? tTransfer.actions.submitting : tTransfer.actions.submit}
        </Button>
      </div>
    </div>
  )
}
