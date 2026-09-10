import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { HolderEntity, User } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { t, tTransfer } from "@/i18n"
import { SearchSelect } from "@/features/common/SearchSelect"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
  const [ownerID, setOwnerID] = useState(event.to_owner_id ?? "")
  const [note, setNote] = useState(event.note ?? "")
  const [banner, setBanner] = useState<string | null>(null)

  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") })
  const holders = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
  })

  const save = useMutation({
    mutationFn: () =>
      api.patch<Transfer[]>(`/transfers/${event.id}`, {
        to_holder_type: holderType,
        to_holder_id: holderID,
        to_owner_id: ownerID,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline", assetID] })
      queryClient.invalidateQueries({ queryKey: ["asset", assetID] })
      onClose()
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  const options = holderType === "user" ? (users.data ?? []) : (holders.data ?? [])

  return (
    <section aria-label={tTransfer.editTail} className="grid content-start gap-3">
      <h2 className="text-[21px] leading-tight font-bold">{tTransfer.editTail}</h2>
      <div className="grid gap-4">
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
            {/* Searchable: holders and accounts both grow without bound. */}
            <SearchSelect
              id="ee-holder"
              value={holderID}
              onChange={setHolderID}
              placeholder={t.common.select}
              options={options.map((o) => ({ value: o.id, label: o.name }))}
            />
          </Field>
          <Field>
            {/* The owner was the one thing the server would accept here and the
                form never sent, so a movement filed against the wrong person
                could only be answered with a second movement -- inventing an
                event that never happened in order to fix one that did. Empty is
                a real answer: a device may be nobody's to look after. */}
            <FieldLabel htmlFor="ee-owner">{t.assets.owner}</FieldLabel>
            <SearchSelect
              id="ee-owner"
              value={ownerID}
              onChange={setOwnerID}
              placeholder={t.common.none}
              options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
            />
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
      </div>
    </section>
  )
}
