import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { AssetStatus, HolderEntity, User } from "@/lib/types"
import type { TransferResult } from "@/lib/transferTypes"
import { zh, zhTransfer } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type TransferAction = "checkout" | "checkin" | "transfer" | "reassign" | "status"

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
  const [action, setAction] = useState<TransferAction | null>(initialAction ?? null)
  const [holderType, setHolderType] = useState<"user" | "entity">("user")
  const [holderID, setHolderID] = useState("")
  const [ownerID, setOwnerID] = useState("")
  const [status, setStatus] = useState<AssetStatus>("in_repair")
  const [note, setNote] = useState("")
  const [banner, setBanner] = useState<string | null>(null)

  // Reopening with a different button must not show the previous choice.
  useEffect(() => {
    if (open) {
      setAction(initialAction ?? null)
      setBanner(null)
    }
  }, [open, initialAction])

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
          break
        case "checkin":
          body.to_status = "in_stock"
          // No destination named: the server uses the default stock point, and
          // says so if none is marked rather than failing opaquely.
          body.check_in = true
          break
        case "transfer":
          body.to_holder_type = holderType
          body.to_holder_id = holderID
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
          <div className="grid gap-1.5">
            <Label htmlFor="td-action">{zhTransfer.actions.action}</Label>
            <select
              id="td-action"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={action ?? ""}
              onChange={(e) => setAction((e.target.value || null) as TransferAction | null)}
            >
              <option value="">—</option>
              {transferActions.map(([a, label]) => (
                <option key={a} value={a}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {needsHolder && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="td-holder-type">{zhTransfer.actions.target}</Label>
                <select
                  id="td-holder-type"
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  value={holderType}
                  onChange={(e) => {
                    setHolderType(e.target.value as "user" | "entity")
                    setHolderID("")
                  }}
                >
                  <option value="user">{zh.common.user}</option>
                  <option value="entity">{zh.common.entityGroup}</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="td-holder">
                  {holderType === "user" ? zh.common.user : zh.common.holder}
                </Label>
                <select
                  id="td-holder"
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  value={holderID}
                  onChange={(e) => setHolderID(e.target.value)}
                >
                  <option value="">—</option>
                  {(holderType === "user" ? users.data ?? [] : holders.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {action === "reassign" && (
            <div className="grid gap-1.5">
              <Label htmlFor="td-owner">{zhTransfer.actions.owner}</Label>
              <select
                id="td-owner"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={ownerID}
                onChange={(e) => setOwnerID(e.target.value)}
              >
                <option value="">—</option>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {action === "status" && (
            <div className="grid gap-1.5">
              <Label htmlFor="td-status">{zhTransfer.actions.status}</Label>
              <select
                id="td-status"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
              >
                {Object.entries(zh.status).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}

          {action === "checkin" && (
            <p className="text-sm text-muted-foreground">{zhTransfer.actions.checkinHint}</p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="td-note">{zhTransfer.actions.note}</Label>
            <Input id="td-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {banner && (
            <p role="alert" className="text-sm text-destructive">
              {banner}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {zh.common.cancel}
          </Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? zhTransfer.actions.submitting : zhTransfer.actions.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
