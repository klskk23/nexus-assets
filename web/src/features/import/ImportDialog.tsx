import { WarningCircle } from "@phosphor-icons/react"
import { useRef, useState, type ReactNode } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { api, ApiError, download } from "@/lib/api"
import type { Category } from "@/lib/types"
import { t, tImport } from "@/i18n"
import { cn } from "cn"
import { TableFrame } from "@/features/common/TableFrame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface RowResult {
  line: number
  status: "ok" | "error"
  display?: string
  fields?: Record<string, string>
}

interface Report {
  total: number
  ok: number
  rows: RowResult[]
}

/**
 * What a committed import produced.
 *
 * Not the same shape the preview answers with: the count of what was written
 * is `created`, and the row-by-row report is nested under it. The page used to
 * read a top-level `ok` here -- which a preview has and this does not -- so
 * every successful import announced itself as 0 devices while writing all of
 * them.
 */
interface CommitResult {
  created: number
  batch_id: string
  report: Report
}

/** The two steps send the same thing: a category and a file. */
function upload<T>(path: string, categoryID: string, file: File): Promise<T> {
  const body = new FormData()
  body.append("category_id", categoryID)
  body.append("file", file)
  return api.upload<T>(path, body)
}

/**
 * The report a refusal carries.
 *
 * A refused commit is not an empty answer: which lines are in the way is the
 * whole content of it, and the page keeps showing them.
 */
function reportOf(e: unknown): Report | undefined {
  if (!(e instanceof ApiError)) return undefined
  return (e.payload as { report?: Report } | undefined)?.report
}

/**
 * One stage of the import, and the card it lives in.
 *
 * The numbering is here rather than in the copy: a heading that reads
 * "1. Download the template" is a list pretending to be a flow, and it says
 * the number twice the moment a rail is drawn above it. Here the number is
 * the position and the heading is the name of the thing.
 *
 * A stage nobody can act on yet is dimmed rather than hidden. Hiding it would
 * mean the page changed shape underneath somebody halfway through, and would
 * take away the one thing worth knowing at step one: how much is left.
 */
function Step({
  n,
  title,
  hint,
  state,
  children,
}: {
  n: number
  title: string
  /**
   * What pressing on costs, when it costs something.
   *
   * Not a description of how the step works -- those went, along with every
   * other line of prose sitting under a heading explaining the system to
   * somebody who reads it once. Only step three has one left, because "the
   * whole file or none of it" is a consequence of the button below it rather
   * than an explanation of the screen.
   */
  hint?: string
  state: "done" | "current" | "waiting"
  children: ReactNode
}) {
  return (
    /* Handoff d10: a 24px numbered circle in a 24px column, the step's
       content beside it. Done and current steps wear the accent on the
       circle; a step not reached yet is drawn in neutral-700 and its title
       in neutral-400. No card around a step: the dialog is the card. */
    <li
      aria-label={title}
      aria-current={state === "current" ? "step" : undefined}
      className="grid grid-cols-[24px_1fr] gap-3"
    >
      <span
        aria-hidden
        className={cn(
          "grid size-6 place-items-center rounded-full border text-xs",
          state === "waiting" ? "border-neutral-700 text-neutral-500" : "border-primary text-primary",
        )}
      >
        {n}
      </span>
      <div className="grid content-start gap-2.5">
        <h2 className={cn("text-sm font-medium", state === "waiting" && "text-neutral-400")}>
          {title}
        </h2>
        {hint && <p className="text-neutral-500 text-[12.5px]">{hint}</p>}
        {children}
      </div>
    </li>
  )
}

/**
 * Importing, in a dialog.
 *
 * It was a page on the navigation bar, which put a rare job beside the eleven
 * things people do daily and made it look like a place rather than an act. It
 * is an act: you are on the asset list, or reading the overview, and you want
 * these rows in. So it opens from there, and closing it puts you back where
 * you were rather than on a screen you now have to navigate away from.
 *
 * The three steps are unchanged. They still read as one job in one block --
 * the order is the point, which is why it is an ordered list and a screen
 * reader hears "3 of 3".
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [categoryID, setCategoryID] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })

  const preview = useMutation({
    mutationFn: () => upload<Report>("/import/preview", categoryID, file!),
    onSuccess: (r) => {
      setBanner(null)
      setReport(r)
    },
    onError: (e) => {
      setReport(null)
      setBanner(e instanceof ApiError ? e.message : t.common.error)
    },
  })

  const commit = useMutation({
    mutationFn: () => upload<CommitResult>("/import/commit", categoryID, file!),
    onSuccess: (r) => {
      setReport(null)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ""
      setBanner(tImport.done(r.created))
    },
    onError: (e) => {
      const refused = reportOf(e)
      if (refused) setReport(refused)
      setBanner(e instanceof ApiError ? e.message : t.common.error)
    },
  })

  const failing = report?.rows.filter((r) => r.status === "error") ?? []
  const canPreview = categoryID !== "" && file !== null
  const canCommit = report !== null && report.ok === report.total && report.total > 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] gap-[22px] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{tImport.title}</DialogTitle>
        </DialogHeader>
      {/* Three stages of one job, so they sit 22px apart in a single block --
          56px between them would read as three unrelated things that happen
          to be on the same page. An ordered list, because that is what it is:
          the order is the point, and a screen reader should hear "3 of 3"
          rather than three headings that happen to follow each other. */}
      <ol aria-label={tImport.steps} className="grid gap-5">

      <Step
        n={1}
        title={tImport.step1}
        state={categoryID === "" ? "current" : "done"}
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-56">
              <FieldLabel htmlFor="im-category">{tImport.category}</FieldLabel>
              <Select
                value={categoryID}
                onValueChange={(v) => {
                  setCategoryID(v)
                  setReport(null)
                }}
              >
                <SelectTrigger id="im-category">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(categories.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {/* Fetched rather than linked: the token lives in a header, and a
                download navigation carries none, which the browser reports as
                a failed download with nothing to read. */}
            <Button
              variant="outline"
              className="mb-0.5"
              disabled={categoryID === "" || downloading}
              onClick={() => {
                setDownloading(true)
                setTemplateError(null)
                download(`/categories/${categoryID}/import-template.csv`, "import-template.csv")
                  .catch((e) =>
                    setTemplateError(e instanceof ApiError ? e.message : t.common.error),
                  )
                  .finally(() => setDownloading(false))
              }}
            >
              {downloading && <Spinner />}
              {tImport.download}
            </Button>
          </div>
          {templateError && (
            <Alert variant="destructive">
              <WarningCircle />
              <AlertDescription>{templateError}</AlertDescription>
            </Alert>
          )}
        </div>
      </Step>

      <Step
        n={2}
        title={tImport.step2}
        state={categoryID === "" ? "waiting" : report ? "done" : "current"}
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* The dashed zone the prototype draws around the file, with the
                native file input inside it: the input is what a keyboard and
                a screen reader reach, and the zone is what says "drop it
                here" to everyone else. */}
            <Field className="border-neutral-700 w-80 rounded-md border border-dashed p-[12px_14px]">
              <FieldLabel htmlFor="im-file">{tImport.file}</FieldLabel>
              <Input
                id="im-file"
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setReport(null)
                }}
              />
            </Field>
            <Button
              disabled={!canPreview || preview.isPending}
              title={categoryID === "" ? tImport.previewNeedsCategory : undefined}
              onClick={() => preview.mutate()}
            >
              {preview.isPending && <Spinner aria-hidden />}
              {preview.isPending ? tImport.previewing : tImport.preview}
            </Button>
          </div>

          {/* Why the button is dead, said where the button is. The category
              lives in the card above this one, so from down here a chosen file
              and a grey button look like a broken page -- which is what it was
              reported as. A state, not a hint: hiding it behind a question
              mark would hide the answer. */}
          {categoryID === "" && (
            <p className="text-muted-foreground text-sm">{tImport.previewNeedsCategory}</p>
          )}

          {banner && (
            <Alert variant="destructive">
              <WarningCircle />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )}
        </div>
      </Step>

      {report && (
        <Step n={3} title={tImport.step3} hint={tImport.step3Hint} state="current">
          <div className="grid gap-4">
            {/* A banner in the accent tint, not a status colour: how many
                rows will import is a fact about the file, not a state of any
                device (FR-004). The prototype's amber strip is exactly the
                thing that rule forbids. */}
            <p
              role="status"
              className="bg-accent-900 text-accent-200 rounded-md p-[8px_12px] text-[13px]"
            >
              {tImport.summary(report.ok, report.total)}
              <span className="ml-2">
                {failing.length === 0
                  ? tImport.allGood(report.total)
                  : tImport.hasErrors(failing.length)}
              </span>
            </p>

            {failing.length > 0 && (
              <TableFrame>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">{tImport.line}</TableHead>
                      <TableHead>{tImport.problem}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failing.map((r) => (
                      <TableRow key={r.line} aria-label={t.common.lineNo(r.line)}>
                        <TableCell className="text-neutral-500 font-mono">{r.line}</TableCell>
                        <TableCell className="text-destructive">
                          <ul className="grid gap-0.5 text-[13px]">
                            {Object.entries(r.fields ?? {}).map(([k, v]) => (
                              <li key={k}>
                                <span className="font-mono">{k}</span>：{v}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            )}

            <div>
              <Button disabled={!canCommit || commit.isPending} onClick={() => commit.mutate()}>
                {commit.isPending && <Spinner aria-hidden />}
                {commit.isPending ? tImport.committing : tImport.commit}
              </Button>
            </div>
          </div>
        </Step>
        )}
      </ol>
      </DialogContent>
    </Dialog>
  )
}
