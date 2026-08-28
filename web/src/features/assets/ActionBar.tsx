import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { AssetStatus, HolderEntity, User } from "@/lib/types"
import type { TransferResult } from "@/lib/transferTypes"
import { zh, zhTransfer } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Action = "checkout" | "checkin" | "transfer" | "reassign" | "status"

interface Props {
  selected: string[]
  onClear: () => void
  onDone: (count: number) => void
}

/**
 * The bar that rises once rows are ticked.
 *
 * Every action posts to the same endpoint with different fields filled in,
 * which is why sending twenty devices to one customer is one request and one
 * batch rather than twenty separate operations to reconcile later.
 */
export function ActionBar({ selected, onClear, onDone }: Props) {
  const queryClient = useQueryClient()
  const [action, setAction] = useState<Action | null>(null)
  const [holderType, setHolderType] = useState<"user" | "entity">("user")
  const [holderID, setHolderID] = useState("")
  const [ownerID, setOwnerID] = useState("")
  const [status, setStatus] = useState<AssetStatus>("in_repair")
  const [note, setNote] = useState("")
  const [banner, setBanner] = useState<string | null>(null)

  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") })
  const holders = useQuery({ queryKey: ["holders"], queryFn: () => api.get<HolderEntity[]>("/holders") })

  const submit = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { asset_ids: selected, note }
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
      setAction(null)
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      onDone(res.transfers.length)
      onClear()
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  if (selected.length === 0) return null

  const needsHolder = action === "checkout" || action === "transfer"
  const canSubmit =
    action !== null &&
    (!needsHolder || holderID !== "") &&
    (action !== "reassign" || ownerID !== "")

  return (
    <Card className="sticky bottom-4 shadow-lg">
      <CardContent className="grid gap-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{zhTransfer.actions.selected(selected.length)}</span>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["checkout", zhTransfer.actions.checkout],
                ["checkin", zhTransfer.actions.checkin],
                ["transfer", zhTransfer.actions.transfer],
                ["reassign", zhTransfer.actions.reassign],
                ["status", zhTransfer.actions.changeStatus],
              ] as [Action, string][]
            ).map(([a, label]) => (
              <Button
                key={a}
                size="sm"
                variant={action === a ? "secondary" : "ghost"}
                onClick={() => setAction(a)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
            {zhTransfer.actions.clear}
          </Button>
        </div>

        {action && (
          <div className="flex flex-wrap items-end gap-4">
            {needsHolder && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="ab-holder-type">{zhTransfer.actions.target}</Label>
                  <select
                    id="ab-holder-type"
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
                  <Label htmlFor="ab-holder">
                    {holderType === "user" ? zh.common.user : zh.common.holder}
                  </Label>
                  <select
                    id="ab-holder"
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
                <Label htmlFor="ab-owner">{zhTransfer.actions.owner}</Label>
                <select
                  id="ab-owner"
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
                <Label htmlFor="ab-status">{zhTransfer.actions.status}</Label>
                <select
                  id="ab-status"
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
              <p className="pb-2 text-sm text-muted-foreground">{zhTransfer.actions.checkinHint}</p>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="ab-note">{zhTransfer.actions.note}</Label>
              <Input id="ab-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button
              className="mb-0.5"
              disabled={!canSubmit || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? zhTransfer.actions.submitting : zhTransfer.actions.submit}
            </Button>
          </div>
        )}

        {banner && (
          <p role="alert" className="text-sm text-destructive">
            {banner}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
