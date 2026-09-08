import type { Transfer } from "@/lib/transferTypes"
import { locale, t, tTransfer } from "@/i18n"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StateBoundary } from "@/components/StateBoundary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

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
      {/* Rows separated by rules, each led by a sage dot.
       *
       * Sage because in this palette that colour means quantity and nothing
       * else -- it is not an action and not a status, so a column of dots down
       * a history says "these are events" without saying anything false about
       * what happened in them. The action chip sits on --well behind a muted
       * outline for the same reason: colour on this product means status, and
       * "checked out" the verb must not borrow the look of "已签出" the state.
       *
       * The newest entry reads differently from the ones behind it -- a ring
       * rather than a filled dot, plus a word. The difference is shape and
       * text, not hue: a history whose tiers differ only in colour tells a
       * colour-blind reader nothing, and this one is printed and photographed
       * as often as it is read on a screen.
       *
       * There are two tiers, not the three the prototype drew. The third would
       * be "where this can go next", and the transition matrix that answers it
       * lives on the server. A greyed-out future invented on the client would
       * be a guess, and wrong the moment somebody edits a status. */}
      <ol className="grid" aria-label={tTransfer.timeline}>
        {entries.map(({ event, count }, i) => (
          <li
            key={event.id}
            aria-label={tTransfer.kind[event.kind] ?? event.kind}
            className={cn(
              "border-border-muted grid grid-cols-[auto_1fr] gap-x-3 border-t py-[18px]",
              i === entries.length - 1 && "border-b",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2.5 shrink-0 rounded-full",
                i === 0 ? "border-accent-2 border-[3px]" : "bg-accent-2",
              )}
            />
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {i === 0 && <Badge variant="outline">{tTransfer.current}</Badge>}
                <Badge variant="outline" className="bg-well border-border-muted">
                  {tTransfer.kind[event.kind] ?? event.kind}
                </Badge>
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
            </div>
          </li>
        ))}
      </ol>
    </StateBoundary>
  )
}
