import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { HolderEntity, User } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { t, tTransfer } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  const options = holderType === "user" ? users.data ?? [] : holders.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tTransfer.editTail}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">{tTransfer.editHint}</p>

        <div className="flex flex-wrap items-end gap-4">
          <Field>
            <FieldLabel htmlFor="ee-type">{tTransfer.actions.target}</FieldLabel>
            <Select
              value={holderType}
              onValueChange={(v) => {
                setHolderType(v as "user" | "entity")
                setHolderID("")
              }}
            >
              <SelectTrigger id="ee-type">
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
            <FieldLabel htmlFor="ee-holder">
              {holderType === "user" ? t.common.user : t.common.holder}
            </FieldLabel>
            <Select value={holderID} onValueChange={setHolderID}>
              <SelectTrigger id="ee-holder">
                <SelectValue placeholder={t.common.select} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ee-note">{tTransfer.note}</FieldLabel>
            <Input id="ee-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {banner && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button disabled={holderID === "" || save.isPending} onClick={() => save.mutate()}>
            {tTransfer.save}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {tTransfer.cancel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
