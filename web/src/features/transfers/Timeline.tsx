import { Fragment } from "react"

import type { Transfer } from "@/lib/transferTypes"
import { locale, t, tTransfer } from "@/i18n"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StateBoundary } from "@/components/StateBoundary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface Props {
  events: Transfer[]
  isLoading?: boolean
  error?: Error | null
  /** Id of the event that may still be corrected, if any. */
  editableId?: string
  onEdit?: (event: Transfer) => void
}

/** One rendered row: a single event, or a whole batch collapsed into one. */
interface Entry {
  event: Transfer
  count: number
}

/**
 * Folds events that share a batch_id into one row.
 *
 * Twenty devices shipped together are one action. Listing them twenty times
 * buries everything else that ever happened, so the row says "batch of 20"
 * instead. Events without a batch id are never folded.
 */
export function foldBatches(events: Transfer[]): Entry[] {
  const out: Entry[] = []
  const indexByBatch = new Map<string, number>()

  for (const event of events) {
    if (!event.batch_id) {
      out.push({ event, count: 1 })
      continue
    }
    const at = indexByBatch.get(event.batch_id)
    if (at === undefined) {
      indexByBatch.set(event.batch_id, out.length)
      out.push({ event, count: 1 })
    } else {
      out[at].count += 1
    }
  }
  return out
}

export function Timeline({ events, isLoading = false, error = null, editableId, onEdit }: Props) {
  const statuses = useStatuses()

  const entries = foldBatches(events)

  return (
    <StateBoundary
      isLoading={isLoading}
      error={error}
      isEmpty={entries.length === 0}
      emptyTitle={tTransfer.empty}
      emptyHint={tTransfer.emptyHint}
    >
      <ol className="grid gap-4" aria-label={tTransfer.timeline}>
        {entries.map(({ event, count }, i) => (
          <Fragment key={event.id}>
            {i > 0 && <Separator />}
            <li aria-label={tTransfer.kind[event.kind] ?? event.kind} className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{tTransfer.kind[event.kind] ?? event.kind}</Badge>
                {count > 1 && <Badge variant="outline">{tTransfer.batch(count)}</Badge>}
                <span className="text-sm text-muted-foreground">
                  {new Date(event.created_at).toLocaleString(locale())}
                </span>
                {event.actor && (
                  <span className="text-sm text-muted-foreground">
                    {tTransfer.by}：{event.actor.name}
                  </span>
                )}
                {event.edited_at && (
                  <Badge variant="secondary">
                    {tTransfer.edited(event.edited_by_name ?? t.common.none)}
                  </Badge>
                )}
              </div>

              <p className="text-sm">
                {event.from_holder && (
                  <>
                    <span className="text-muted-foreground">{tTransfer.from} </span>
                    {event.from_holder.name ?? event.from_holder.id}
                    {event.from_status && (
                      <span className="text-muted-foreground">
                        （{statuses.label(event.from_status)}）
                      </span>
                    )}
                    <span className="text-muted-foreground"> {tTransfer.to} </span>
                  </>
                )}
                {event.to_holder.name ?? event.to_holder.id}
                <span className="text-muted-foreground">
                  （{statuses.label(event.to_status)}）
                </span>
              </p>

              {event.note && (
                <p className="text-sm text-muted-foreground">
                  {tTransfer.note}：{event.note}
                </p>
              )}

              {onEdit && event.id === editableId && (
                <div>
                  <Button variant="outline" size="sm" onClick={() => onEdit(event)}>
                    {tTransfer.editTail}
                  </Button>
                </div>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </StateBoundary>
  )
}
