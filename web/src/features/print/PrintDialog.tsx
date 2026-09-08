import { AlertCircleIcon, CheckIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useMutation, useQueries } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { t } from "@/i18n"
import { usePrinting } from "@/features/print/usePrinting"
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
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

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
  presets?: { id: string; name: string; templateId?: string }[]
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
  const { url: printerURL } = usePrinting()
  const [batches, setBatches] = useState<Batch[]>([])
  const [banner, setBanner] = useState<string | null>(null)
  // What became of the print service's copy of these rows, said once, after
  // somebody has gone to look at a label.
  const [sourceNote, setSourceNote] = useState<string | null>(null)
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

  // The design behind a batch's chosen label, when the print service told us
  // which one it is. The preset rides along in the query: the template alone
  // opens the right label but leaves the printer and the copies to be picked
  // again, which is most of what somebody came here to avoid.
  const designHref = (b: Batch) => {
    // What is about to be printed, which is the choice on screen rather than
    // the one the server proposed before anybody touched the list.
    const preset = chosen[b.category_id] ?? b.preset_id ?? ""
    if (printerURL === "" || preset === "") return ""
    const template = (b.presets ?? []).find((p) => p.id === preset)?.templateId
    return template ? `${printerURL}/design/${template}?preset=${encodeURIComponent(preset)}` : ""
  }

  /**
   * Make the print service re-read this category before the designer opens.
   *
   * The label over there is drawn against that service's own copy of our rows,
   * and until now that copy was as old as the last time somebody pressed
   * refresh in its interface -- so the device you clicked through to check
   * would show yesterday's holder, with nothing on either screen to say why.
   *
   * Fired without holding the link up: the anchor opens its tab the moment it
   * is clicked, which is what keeps the browser from treating this as a popup,
   * and the refresh lands while that tab is still loading. What it did is
   * reported here rather than there, since this is the screen being looked at.
   */
  const refreshSource = useMutation({
    mutationFn: (categoryID: string) =>
      api.post<{ sources: { name?: string; rows: number }[] }>("/print/refresh-source", {
        category_id: categoryID,
      }),
    onSuccess: (res) =>
      setSourceNote(
        res.sources.length === 0
          ? t.print.sourceNone
          : t.print.sourceRefreshed(res.sources.reduce((n, x) => n + x.rows, 0)),
      ),
    onError: (e) => setSourceNote(e instanceof ApiError ? e.message : t.common.error),
  })

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

  // Only once paper has actually been asked for. Before that no batch has a
  // job, "every job has finished" is vacuously true, and the dialog announced
  // that everything had printed while the button to print it was still there.
  const settled =
    confirmed &&
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
      <DialogContent className="sm:max-w-[620px]">
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
          /* One card per job rather than one row per job.
           *
           * A print run is not a ledger: there are two or three of these, each
           * carrying a name, a label, a progress figure and a status, and a
           * table made every one of those a column that was empty for most of
           * the run. Cards let the parts that only exist sometimes -- the
           * numbers being claimed, a failure message -- appear without a
           * column standing empty when they do not. */
          <ul className="grid gap-3">
            {batches.map((b) => {
              const poll = stateOf(b)
              const job = poll?.data
              const printed = job?.pagesPrinted ?? 0
              return (
                <li
                  key={b.category_id}
                  className="bg-well grid gap-3 rounded-[28px] px-[26px] py-[22px]"
                >
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="w-[190px] font-medium">{b.category_name}</span>

                    <span className="flex min-w-40 flex-1 items-center gap-1">
                      {confirmed || (b.presets ?? []).length <= 1 ? (
                        // Linked to the design itself when it can be: "this
                        // one looks wrong" is only actionable if the link
                        // lands on the label rather than on a front door.
                        designHref(b) ? (
                          <a
                            href={designHref(b)}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4"
                            onClick={() => refreshSource.mutate(b.category_id)}
                          >
                            {b.preset_name}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{b.preset_name ?? ""}</span>
                        )
                      ) : (
                        // More than one label on this kind of thing, so which
                        // one is a decision, not a default to be guessed at.
                        <>
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
                          {/* The chosen one is still openable: a label picked
                              from a list is exactly the one somebody may want
                              to look at before committing paper to it. */}
                          {designHref(b) && (
                            <Button variant="ghost" size="icon" asChild>
                              <a
                                href={designHref(b)}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t.print.openDesign}
                                title={t.print.openDesign}
                                onClick={() => refreshSource.mutate(b.category_id)}
                              >
                                <ExternalLinkIcon />
                              </a>
                            </Button>
                          )}
                        </>
                      )}
                    </span>

                    <span className="flex items-center gap-2">
                      {b.error ? (
                        <span className="text-destructive text-sm">{b.error}</span>
                      ) : poll?.isError ? (
                        <span className="text-destructive text-sm">{t.print.lost}</span>
                      ) : !confirmed ? (
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {t.print.unit(b.count)}
                        </span>
                      ) : (
                        <>
                          {job && !FINISHED.includes(job.status) && <Spinner aria-hidden />}
                          <Badge variant={job?.status === "failed" ? "destructive" : "secondary"}>
                            {label(job?.status ?? b.status)}
                          </Badge>
                        </>
                      )}
                    </span>
                  </div>

                  {confirmed && !b.error && !poll?.isError && (
                    /* Sage, not a status colour: this track is counting
                       sheets, and how far along a run is says nothing about
                       what state anything is in. The one row that does take a
                       status colour is a failed one, because that genuinely
                       is a state -- and it says so in the chip above. */
                    <span className="flex items-center gap-3">
                      <Progress
                        value={b.count > 0 ? (printed / b.count) * 100 : 0}
                        className="bg-background h-4 flex-1 [&>*]:bg-accent-2"
                        aria-label={t.print.pages(printed, b.count)}
                      />
                      <span className="font-heading text-sm tabular-nums">
                        {printed}/{b.count}
                      </span>
                    </span>
                  )}

                  {!confirmed && (
                    // The numbers, not just how many: a count cannot be
                    // checked against the devices in front of you.
                    <span className="text-muted-foreground max-h-24 overflow-y-auto font-mono text-xs leading-5 break-all">
                      {(b.numbers ?? []).join("  ")}
                    </span>
                  )}

                  {job?.failureMessage && (
                    <span className="text-destructive text-xs">{job.failureMessage}</span>
                  )}
                  {/* Numbers minted in the print service are invisible here
                      unless they are said out loud. */}
                  {(b.claims ?? []).map((c) => (
                    <span key={c.poolId} className="text-muted-foreground text-xs">
                      {t.print.claims(c.variableName, c.start, c.end)}
                    </span>
                  ))}
                </li>
              )
            })}
          </ul>
        )}

        {sourceNote && (
          <Alert role="status">
            <RefreshCwIcon />
            <AlertDescription>{sourceNote}</AlertDescription>
          </Alert>
        )}

        {settled && (
          <Alert variant={anyFailed ? "destructive" : "default"}>
            {anyFailed ? <AlertCircleIcon /> : <CheckIcon />}
            <AlertDescription>
              {anyFailed ? t.print.someFailed : t.print.allDone}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {/* An escape hatch, not a second way to print: when a batch looks
              wrong, or a label needs changing, the only useful thing this page
              can offer is the way over to where that is done. */}
          {printerURL !== "" && (
            <Button variant="ghost" size="sm" className="mr-auto" asChild>
              {/* Where the labels are managed once printing has started, and
                  the queue once something has gone wrong there. */}
              <a
                href={`${printerURL}${anyFailed && confirmed ? "/queue" : "/print-presets"}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLinkIcon />
                {anyFailed && confirmed ? t.print.openQueue : t.print.openService}
              </a>
            </Button>
          )}
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
              {submit.isPending && <Spinner aria-hidden />}
              {t.print.confirm(printable)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
