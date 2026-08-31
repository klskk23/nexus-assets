import { AlertCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { AssetStatus, HolderEntity, User } from "@/lib/types"
import type { TransferResult } from "@/lib/transferTypes"
import { zh, zhTransfer } from "@/i18n/zh"
import { useStatuses } from "@/features/statuses/useStatuses"
import { useAuth } from "@/features/auth/useAuth"
import { FieldDescription } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

export const transferActions: [TransferAction, string][] = [
  ["checkout", zhTransfer.actions.checkout],
  ["checkin", zhTransfer.actions.checkin],
  ["transfer", zhTransfer.actions.transfer],
  ["reassign", zhTransfer.actions.reassign],
  ["status", zhTransfer.actions.changeStatus],
]

interface Props {
  assetIDs: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselects an action; the list page passes the button that was clicked. */
  initialAction?: TransferAction | null
  onDone: (count: number) => void
}

/**
 * The one place a transfer is composed.
 *
 * Both entry points open this: the list page's action bar with the clicked
 * action preselected, and the detail page's single button with none. The
 * request is identical either way -- a single asset is just a one-element
 * batch -- so the two surfaces cannot drift apart in behaviour.
 */
export function TransferDialog({ assetIDs, open, onOpenChange, initialAction, onDone }: Props) {
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
  useEffect(() => {
    if (open) {
      setAction(initialAction ?? null)
      setBanner(null)
      setResponsibleID(user?.id ?? KEEP)
    }
  }, [open, initialAction, user?.id])

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: open,
  })
  const holders = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
    enabled: open,
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
          // No destination named: the server uses the default stock point, and
          // says so if none is marked rather than failing opaquely.
          body.check_in = true
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
      onOpenChange(false)
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  const needsHolder = action === "checkout" || action === "transfer"
  // Check-in always lands on an entity -- the default stock point -- so it
  // asks too, without a holder picker of its own.
  const needsResponsible =
    (needsHolder && holderType === "entity") || action === "checkin"
  const canSubmit =
    action !== null &&
    (!needsHolder || holderID !== "") &&
    (action !== "reassign" || ownerID !== "")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{zhTransfer.actions.title}</DialogTitle>
          <DialogDescription>{zhTransfer.actions.selected(assetIDs.length)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="td-action">{zhTransfer.actions.action}</FieldLabel>
            <ToggleGroup
              id="td-action"
              type="single"
              variant="outline"
              className="justify-start"
              value={action ?? ""}
              onValueChange={(v) => setAction((v || null) as TransferAction | null)}
            >
              {transferActions.map(([a, label]) => (
                <ToggleGroupItem key={a} value={a} aria-label={label}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          {needsHolder && (
            <>
              <Field>
                <FieldLabel htmlFor="td-holder-type">{zhTransfer.actions.target}</FieldLabel>
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
                      <SelectItem value="user">{zh.common.user}</SelectItem>
                      <SelectItem value="entity">{zh.common.entityGroup}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="td-holder">
                  {holderType === "user" ? zh.common.user : zh.common.holder}
                </FieldLabel>
                <Select value={holderID} onValueChange={setHolderID}>
                  <SelectTrigger id="td-holder">
                    <SelectValue placeholder={zh.common.select} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(holderType === "user" ? users.data ?? [] : holders.data ?? []).map((o) => (
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
              <FieldLabel htmlFor="td-responsible">{zhTransfer.actions.owner}</FieldLabel>
              <Select value={responsibleID} onValueChange={setResponsibleID}>
                <SelectTrigger id="td-responsible">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {/* Leaving it alone has to be sayable: a warehouse-to-
                        warehouse move need not change who is answerable. */}
                    <SelectItem value={KEEP}>{zhTransfer.actions.keepOwner}</SelectItem>
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
              <FieldDescription>{zhTransfer.actions.ownerHint}</FieldDescription>
            </Field>
          )}

          {action === "reassign" && (
            <Field>
              <FieldLabel htmlFor="td-owner">{zhTransfer.actions.owner}</FieldLabel>
              <Select value={ownerID} onValueChange={setOwnerID}>
                <SelectTrigger id="td-owner">
                  <SelectValue placeholder={zh.common.select} />
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
              <FieldLabel htmlFor="td-status">{zhTransfer.actions.status}</FieldLabel>
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

          {action === "checkin" && (
            <p className="text-sm text-muted-foreground">{zhTransfer.actions.checkinHint}</p>
          )}

          <Field>
            <FieldLabel htmlFor="td-note">{zhTransfer.actions.note}</FieldLabel>
            <Input id="td-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {banner && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {zh.common.cancel}
          </Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {submit.isPending ? zhTransfer.actions.submitting : zhTransfer.actions.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
