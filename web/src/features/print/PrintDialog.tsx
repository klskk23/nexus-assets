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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  /** This category's labels, so the choice is made here rather than guessed. */
  presets?: { id: string; name: string }[]
  preset_id?: string
  preset_name?: string
  numbers?: string[]
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
 * Asks what is about to be printed, then watches until the labels are out.
 *
 * Two steps because paper comes out of a machine in another room. Opening this
 * works out what would be printed and prints nothing; the second press is the
 * one that spends the roll. What it can say beforehand is worth the extra
 * click: how many labels, split across which categories, under which label
 * design, and which category has no label at all -- that last one being much
 * better learned before the press than after it.
 *
 * The watching half is watching rather than firing and forgetting: the service
 * accepts a job and answers immediately, so everything that can go wrong at the
 * printer -- paper out, a queue paused by an earlier failure -- happens after
 * the reply. A page that said "submitted" and stopped there would call that a
 * success.
 */
export function PrintDialog({ ids, onClose }: Props) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [banner, setBanner] = useState<string | null>(null)
  // Until this, nothing has reached a printer.
  const [confirmed, setConfirmed] = useState(false)
  // Which label each category prints. One label is not a choice, so the plan
  // proposes it and this only ever differs when there is something to decide.
  const [chosen, setChosen] = useState<Record<string, string>>({})

  const plan = useMutation({
    mutationFn: () => api.post<{ batches: Batch[] }>("/print", { ids, dry_run: true }),
    onSuccess: (res) => {
      setBatches(res.batches)
      setChosen(
        Object.fromEntries(
          res.batches.filter((b) => b.preset_id).map((b) => [b.category_id, b.preset_id!]),
        ),
      )
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const submit = useMutation({
    mutationFn: () => api.post<{ batches: Batch[] }>("/print", { ids, presets: chosen }),
    onSuccess: (res) => {
      setBatches(res.batches)
      setConfirmed(true)
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  useEffect(() => {
    plan.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const jobs = confirmed ? batches.filter((b) => b.job_id) : []
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

  // What would actually reach a printer: a category with no label of its own
  // contributes nothing, and if that is all of them there is nothing to press.
  const printable = batches.reduce((n, b) => (b.error ? n : n + b.count), 0)

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

        {(plan.isPending || submit.isPending) && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner aria-hidden />
            {submit.isPending ? t.print.submitting : t.print.planning}
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
                  <TableHead>{t.print.label}</TableHead>
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
                      <TableCell>
                        {confirmed || (b.presets ?? []).length <= 1 ? (
                          <span className="text-muted-foreground">{b.preset_name ?? ""}</span>
                        ) : (
                          // More than one label on this kind of thing, so which
                          // one is a decision, not a default to be guessed at.
                          <Select
                            value={chosen[b.category_id] ?? ""}
                            onValueChange={(v) =>
                              setChosen((cur) => ({ ...cur, [b.category_id]: v }))
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              className="w-40"
                              aria-label={`${b.category_name} ${t.print.label}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {(b.presets ?? []).map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{t.print.unit(b.count)}</TableCell>
                      <TableCell className="grid gap-1">
                        {b.error ? (
                          <span className="text-destructive">{b.error}</span>
                        ) : poll?.isError ? (
                          <span className="text-destructive">{t.print.lost}</span>
                        ) : !confirmed ? (
                          // The numbers, not just how many: a count cannot be
                          // checked against the devices in front of you.
                          <span className="text-muted-foreground max-h-24 overflow-y-auto font-mono text-xs leading-5 break-all">
                            {(b.numbers ?? []).join("  ")}
                          </span>
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
            {confirmed ? t.common.close : t.common.cancel}
          </Button>
          {/* The press that spends paper. Gone once it has been made, so the
              same dialog cannot print the same labels twice. */}
          {!confirmed && (
            <Button
              onClick={() => submit.mutate()}
              disabled={plan.isPending || submit.isPending || printable === 0}
            >
              {submit.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {t.print.confirm(printable)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
