import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { HolderEntity, User } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { zh, zhTransfer } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  event: Transfer
  assetID: string
  onClose: () => void
}

/**
 * Corrects the newest event of an asset.
 *
 * The window closes the moment the asset gets another event, which is why this
 * is only ever offered on the tail. The hint says so, so nobody has to discover
 * the rule by having a correction refused.
 */
export function EditEvent({ event, assetID, onClose }: Props) {
  const queryClient = useQueryClient()
  const [holderType, setHolderType] = useState(event.to_holder.type)
  const [holderID, setHolderID] = useState(event.to_holder.id)
  const [note, setNote] = useState(event.note ?? "")
  const [banner, setBanner] = useState<string | null>(null)

  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") })
  const holders = useQuery({ queryKey: ["holders"], queryFn: () => api.get<HolderEntity[]>("/holders") })

  const save = useMutation({
    mutationFn: () =>
      api.patch<Transfer[]>(`/transfers/${event.id}`, {
        to_holder_type: holderType,
        to_holder_id: holderID,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline", assetID] })
      queryClient.invalidateQueries({ queryKey: ["asset", assetID] })
      onClose()
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  const options = holderType === "user" ? users.data ?? [] : holders.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{zhTransfer.editTail}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">{zhTransfer.editHint}</p>

        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ee-type">{zhTransfer.actions.target}</Label>
            <select
              id="ee-type"
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
            <Label htmlFor="ee-holder">{holderType === "user" ? zh.common.user : zh.common.holder}</Label>
            <select
              id="ee-holder"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={holderID}
              onChange={(e) => setHolderID(e.target.value)}
            >
              <option value="">—</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ee-note">{zhTransfer.note}</Label>
            <Input id="ee-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {banner && (
          <p role="alert" className="text-sm text-destructive">
            {banner}
          </p>
        )}

        <div className="flex gap-2">
          <Button disabled={holderID === "" || save.isPending} onClick={() => save.mutate()}>
            {zhTransfer.save}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {zhTransfer.cancel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
