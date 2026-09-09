import { ArrowRightIcon } from "lucide-react"

import type { Transfer } from "@/lib/transferTypes"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { Badge } from "@/components/ui/badge"
import { t, tTransfer } from "@/i18n"

/**
 * One movement, as a single cell.
 *
 * Three tables need this and they must not each write their own: the overview,
 * the movement log and a device's own history all answer "what happened", and
 * a reader moving between them should not have to work out that two different
 * layouts mean the same thing.
 *
 * It carries the whole event, not only the change. 023 turned the timeline
 * into these three tables and kept the arrow, dropping the action's name, the
 * note, the correction mark and the batch along with the component -- so the
 * one column a reader has says less than the filter above it can ask for. Each
 * of those is back, and none of them is a column of its own: three tables would
 * have grown three columns for things that are blank on most rows.
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
export function MovementCell({ event }: { event: Transfer }) {
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
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* The action's name, on --well behind a muted outline. Colour in this
            product means status, and "checked out" the verb must not borrow the
            look of 已签出 the state. It is also the only thing on the row that
            still speaks when every leg stayed put. */}
        <Badge variant="outline" className="bg-well border-border-muted">
          {tTransfer.kind[event.kind] ?? event.kind}
        </Badge>
        {/* Twenty devices shipped together are one action, and the overview
            shows that action once. Without this the other nineteen are simply
            not mentioned anywhere. */}
        {(event.batch_size ?? 0) > 1 && (
          <Badge variant="outline">{tTransfer.batch(event.batch_size ?? 0)}</Badge>
        )}
        {(heldElsewhere || restated) && (
          <>
            {from && (
              <>
                <span className="text-muted-foreground">{fromName}</span>
                {event.from_status && <StatusBadge status={event.from_status} />}
                <ArrowRightIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
              </>
            )}
            <span>{toName}</span>
            <StatusBadge status={event.to_status} />
          </>
        )}
      </span>
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
      {/* Why it moved, in the words of whoever moved it. The form asks for it
          under "记这一次移动的缘由" and nothing printed it, which made every
          answer write-only. */}
      {event.note && (
        <span className="text-muted-foreground text-[13px]">
          {tTransfer.noteIs(event.note)}
        </span>
      )}
      {/* A correction is part of the record, not a silent overwrite. Only the
          newest movement on a device can be corrected, and what it can change
          is the note and the owner -- both of them in this cell, which is why
          the mark belongs here rather than beside the person who moved it. */}
      {event.edited_at && (
        <span className="text-muted-foreground text-[13px]">
          {tTransfer.edited(event.editor?.name ?? event.edited_by ?? t.common.none)}
        </span>
      )}
    </span>
  )
}
