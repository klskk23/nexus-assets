import { ArrowRightIcon } from "lucide-react"

import type { Transfer } from "@/lib/transferTypes"
import { StatusBadge } from "@/features/statuses/StatusBadge"

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
 */
export function TransferChange({ event }: { event: Transfer }) {
  const from = event.from_holder
  const fromName = from?.name ?? from?.id
  const toName = event.to_holder.name ?? event.to_holder.id

  return (
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
  )
}
