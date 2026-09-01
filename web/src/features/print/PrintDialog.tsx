import { useEffect, useState } from "react"
import { useMutation, useQueries } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { t } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Claim {
  poolId: string
  variableName: string
  start: number
  end: number
}

interface Batch {
  category_id: string
  category_name: string
  count: number
  job_id?: string
  status?: string
  error?: string
  claims?: Claim[]
}

interface JobState {
  status: string
  pagesPrinted?: number | null
  failureMessage?: string
}

interface Props {
  ids: string[]
  onClose: () => void
}

/** States the print service will not move on from. */
const FINISHED = ["completed", "failed", "cancelled"]

/**
 * Submits the ticked devices and watches until the labels are out.
 *
 * Watching rather than firing and forgetting: the service accepts a job and
 * answers immediately, so everything that can go wrong at the printer -- paper
 * out, the queue paused by an earlier failure -- happens after the reply. A
 * page that said "submitted" and stopped there would call that a success.
 */
export function PrintDialog({ ids, onClose }: Props) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [banner, setBanner] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () => api.post<{ batches: Batch[] }>("/print", { ids }),
    onSuccess: (res) => setBatches(res.batches),
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  // Once, on open: pressing print is the decision, and the dialog is the
  // report of what came of it.
  useEffect(() => {
    submit.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const jobs = batches.filter((b) => b.job_id)
  const polls = useQueries({
    queries: jobs.map((b) => ({
      queryKey: ["print-job", b.job_id],
      queryFn: () => api.get<JobState>(`/print/jobs/${b.job_id}`),
      // Stops on its own once the job settles, so a finished dialog is not a
      // page quietly asking the same question forever.
      refetchInterval: (query: { state: { data?: JobState } }) =>
        query.state.data && FINISHED.includes(query.state.data.status) ? false : 1500,
      retry: false,
    })),
  })

  const stateOf = (b: Batch) => {
    const index = jobs.findIndex((j) => j.job_id === b.job_id)
    return index < 0 ? undefined : polls[index]
  }

  const label = (status?: string) => {
    switch (status) {
      case "queued":
        return t.print.statusQueued
      case "printing":
        return t.print.statusPrinting
      case "completed":
        return t.print.statusCompleted
      case "failed":
        return t.print.statusFailed
      case "cancelled":
        return t.print.statusCancelled
      default:
        return status ?? ""
    }
  }

  const settled =
    batches.length > 0 &&
    batches.every((b) => {
      if (!b.job_id) return true
      const s = stateOf(b)?.data?.status
      return s !== undefined && FINISHED.includes(s)
    })
  const anyFailed = batches.some(
    (b) => b.error || stateOf(b)?.data?.status === "failed" || stateOf(b)?.isError,
  )

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.print.title}</DialogTitle>
          {batches.length > 0 && (
            <DialogDescription>
              {t.print.splitHint(ids.length, batches.length)}
            </DialogDescription>
          )}
        </DialogHeader>

        {submit.isPending && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner aria-hidden />
            {t.print.submitting}
          </p>
        )}

        {banner && (
          <Alert variant="destructive">
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        )}

        {batches.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.print.category}</TableHead>
                  <TableHead>{t.print.count}</TableHead>
                  <TableHead>{t.print.state}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const poll = stateOf(b)
                  const job = poll?.data
                  return (
                    <TableRow key={b.category_id}>
                      <TableCell>{b.category_name}</TableCell>
                      <TableCell className="tabular-nums">{t.print.unit(b.count)}</TableCell>
                      <TableCell className="grid gap-1">
                        {b.error ? (
                          <span className="text-destructive">{b.error}</span>
                        ) : poll?.isError ? (
                          <span className="text-destructive">{t.print.lost}</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            {job && !FINISHED.includes(job.status) && <Spinner aria-hidden />}
                            <Badge variant={job?.status === "failed" ? "destructive" : "secondary"}>
                              {label(job?.status ?? b.status)}
                            </Badge>
                            {job?.pagesPrinted != null && (
                              <span className="text-muted-foreground text-xs">
                                {t.print.pages(job.pagesPrinted, b.count)}
                              </span>
                            )}
                          </span>
                        )}
                        {job?.failureMessage && (
                          <span className="text-destructive text-xs">{job.failureMessage}</span>
                        )}
                        {/* Numbers minted in the print service are invisible
                            here unless they are said out loud. */}
                        {(b.claims ?? []).map((c) => (
                          <span key={c.poolId} className="text-muted-foreground text-xs">
                            {t.print.claims(c.variableName, c.start, c.end)}
                          </span>
                        ))}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {settled && (
          <p className={anyFailed ? "text-destructive text-sm" : "text-sm"}>
            {anyFailed ? t.print.someFailed : t.print.allDone}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
