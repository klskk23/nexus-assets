import { ArrowRightIcon } from "lucide-react"

import type { Transfer } from "@/lib/transferTypes"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { t } from "@/i18n"

/**
 * What one movement changed, as a single cell.
 *
 * Three tables need this and they must not each write their own: the overview,
 * the movement log and a device's own history all answer "what happened", and
 * a reader moving between them should not have to work out that two different
 * layouts mean the same thing.
 *
 * Holder and status travel together because a movement usually changes both at
 * once, and reading one without the other tells half a story -- "went to 张三"
 * without "checked out", or a status change with no idea where the thing is.
 * The arrow is the whole grammar: what it was, then what it became.
 *
 * The first record a device ever gets has no "from", so it renders as a
 * destination alone rather than as an arrow out of nothing.
 *
 * **A leg is drawn only when it moved.** A reassignment changes neither the
 * holder nor the status, and the pair rendered anyway put an arrow between two
 * identical names -- a row that says "it moved" about a device that did not,
 * with the one thing that did change nowhere on it. That is worse than a blank
 * cell: a reader has no way to tell it from a bug.
 */
export function TransferChange({ event }: { event: Transfer }) {
  const from = event.from_holder
  const fromName = from?.name ?? from?.id
  const toName = event.to_holder.name ?? event.to_holder.id

  // The id, never a bare uuid where a name belongs -- but a deleted account
  // leaves an id and no name, and the record still has to say who it was.
  const fromOwner = event.from_owner?.name ?? event.from_owner_id
  const toOwner = event.to_owner?.name ?? event.to_owner_id

  const heldElsewhere =
    !from || from.type !== event.to_holder.type || from.id !== event.to_holder.id
  const restated = !from || event.from_status !== event.to_status
  const reassigned = (event.from_owner_id ?? "") !== (event.to_owner_id ?? "")

  return (
    <span className="grid gap-1">
      {(heldElsewhere || restated) && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {from && (
            <>
              <span className="text-muted-foreground">{fromName}</span>
              {event.from_status && <StatusBadge status={event.from_status} />}
              <ArrowRightIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
            </>
          )}
          <span>{toName}</span>
          <StatusBadge status={event.to_status} />
        </span>
      )}
      {reassigned && (
        /* Labelled, because a name on its own in this cell reads as a holder --
           the column is full of them. The label is what tells the reader the
           two names are answering a different question. */
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground text-[13px]">{t.assets.owner}</span>
          {fromOwner && (
            <>
              <span className="text-muted-foreground">{fromOwner}</span>
              <ArrowRightIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
            </>
          )}
          <span>{toOwner || t.common.none}</span>
        </span>
      )}
    </span>
  )
}
