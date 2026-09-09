import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { ALLOWED_PARENTS, PARENT_REQUIRED, type HolderEntity, type HolderUsage } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { RefusalAlert, refusalOf, type Refusal } from "./RefusalAlert"
import { SearchSelect } from "@/features/common/SearchSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Props {
  holder: HolderEntity
  holders: HolderEntity[]
  onClose: () => void
}

/**
 * Renames a holder, moves it, and is the only way to delete one.
 *
 * Both of those live here rather than in the pane, for the reason 024 gave for
 * categories: selection changes with a single click on the rail, so a
 * destructive control sitting on a panel that swaps under you that easily is a
 * worse trade than one extra click. The default-stock button is the one
 * exception and it is in the pane -- see HolderDetail for why.
 *
 * **One refusal path.** The table version had two: a row action refused above
 * the table, a save refused inside the dialog, and the same server answer
 * rendered in two places by two pieces of state. With deleting and saving both
 * in here, there is one place for the server to say no.
 *
 * The type is not editable: turning a company into a location would leave its
 * children pointing at a parent kind the rules forbid, and there is no answer
 * to what happens to them that the operator has agreed to. Delete and recreate
 * says the same thing out loud.
 */
export function HolderEditor({ holder, holders, onClose }: Props) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(holder)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [confirming, setConfirming] = useState(false)

  /**
   * What deleting would cost, asked when somebody reaches for the button.
   *
   * It used to be fetched for every holder on the page at load, so that this
   * sentence could be ready before the click -- N requests for a button that
   * is mostly never pressed, and all of them answering with numbers from the
   * moment the page opened. One request, asked late, is both cheaper and more
   * truthful.
   */
  const usage = useQuery({
    queryKey: ["holders", holder.id, "usage"],
    queryFn: () => api.get<HolderUsage>(`/holders/${holder.id}/usage`),
    enabled: confirming,
  })

  const fail = (e: unknown) => setRefusal(refusalOf(e))
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["holders"] })
    queryClient.invalidateQueries({ queryKey: ["holder-counts"] })
    onClose()
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/holders/${holder.id}`, {
        name: draft.name,
        note: draft.note,
        // Explicit null detaches; the field must be present either way, since
        // this dialog is where a parent gets cleared.
        parent_id: draft.parent_id,
      }),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: () => api.del(`/holders/${holder.id}`),
    onSuccess: done,
    onError: fail,
  })

  const eligible = holders.filter(
    (h) => h.id !== holder.id && ALLOWED_PARENTS[holder.type].includes(h.type),
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
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

          {ALLOWED_PARENTS[holder.type].length > 0 && (
            <Field>
              <FieldLabel htmlFor="he-parent">{tMeta.holders.parent}</FieldLabel>
              {/* Searchable: holders grow without bound. */}
              <SearchSelect
                id="he-parent"
                value={draft.parent_id ?? ""}
                onChange={(v) => setDraft({ ...draft, parent_id: v || null })}
                placeholder={
                  PARENT_REQUIRED[holder.type] ? t.common.select : tMeta.holders.noParent
                }
                options={eligible.map((h) => ({
                  value: h.id,
                  label: `${h.name}（${tMeta.entityTypes[h.type] ?? h.type}）`,
                }))}
              />
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

          {/* No default-stock tick here any more. It moved to the pane because
              it is its own permission, and sharing an entrance with "edit"
              meant somebody could tick it, save, and only then be refused. */}

          {refusal && <RefusalAlert refusal={refusal} />}
        </div>

        <DialogFooter>
          <ConfirmDialog
            trigger={
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={remove.isPending}
                onClick={() => setConfirming(true)}
              >
                {tMeta.holders.delete}
              </Button>
            }
            title={tMeta.holders.deleteTitle}
            description={
              usage.data && usage.data.history > 0
                ? tMeta.holders.deleteHistoryHint(holder.name, usage.data.history)
                : tMeta.holders.deleteHint(holder.name)
            }
            confirmLabel={tMeta.holders.delete}
            tone="danger"
            requirePhrase={holder.name}
            onConfirm={() => remove.mutate()}
          />
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button disabled={draft.name === "" || save.isPending} onClick={() => save.mutate()}>
            {tMeta.holders.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
