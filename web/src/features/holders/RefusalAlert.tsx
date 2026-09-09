import { AlertCircleIcon } from "lucide-react"

import { ApiError, type Blocker, blockerKey } from "@/lib/api"
import { t, tMeta } from "@/i18n"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export interface Refusal {
  message: string
  blockers: Blocker[]
  total: number
}

/** Turns whatever the mutation threw into something renderable. */
export function refusalOf(e: unknown): Refusal {
  return e instanceof ApiError
    ? { message: e.message, blockers: e.blockers ?? [], total: e.total ?? 0 }
    : { message: t.common.error, blockers: [], total: 0 }
}

/**
 * A refusal with the devices behind it.
 *
 * One component because two places can produce one -- the editor when a save
 * or a delete is blocked, the pane when the default-stock marker is -- and a
 * refusal that lists its blockers in one place and not the other would be the
 * same bug twice. The server has attached the blocking devices since the first
 * version; an early client parsed only the count and left the reader with a
 * number and nothing to act on.
 */
export function RefusalAlert({ refusal }: { refusal: Refusal }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{tMeta.holders.blocked}</AlertTitle>
      <AlertDescription className="grid gap-1">
        {refusal.message}
        {refusal.blockers.length > 0 && (
          <>
            <p className="text-xs">{tMeta.holders.blockedBy}</p>
            <ul className="grid gap-0.5 font-mono text-xs">
              {refusal.blockers.map((b) => (
                <li key={blockerKey(b)}>{b.name}</li>
              ))}
              {refusal.total > refusal.blockers.length && (
                <li>{tMeta.holders.blockedMore(refusal.total)}</li>
              )}
            </ul>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}
