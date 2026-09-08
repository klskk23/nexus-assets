import { AlertCircleIcon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { api, ApiError, download } from "@/lib/api"
import type { Category } from "@/lib/types"
import { t, tImport } from "@/i18n"
import { cn } from "cn"
import { TableFrame } from "@/features/common/TableFrame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { PageHeader } from "@/features/common/PageHeader"
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
  hint: string
  state: "done" | "current" | "waiting"
  children: ReactNode
}) {
  return (
    <li
      aria-label={title}
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        "bg-well grid content-start gap-4 rounded-[28px] border px-[26px] py-[22px]",
        state === "current" ? "border-primary" : "border-transparent",
        state === "waiting" && "opacity-60",
      )}
    >
      <div className="grid gap-1">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "font-heading grid size-6 shrink-0 place-items-center rounded-full text-[11px]",
              state === "waiting"
                ? "border-border-muted border"
                : "bg-primary text-primary-foreground",
            )}
          >
            {n}
          </span>
          <h2 className="text-[21px] leading-tight font-bold">{title}</h2>
        </div>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      {children}
    </li>
  )
}

export function Import() {
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
    <div className="grid max-w-[760px] gap-14">
      <PageHeader title={tImport.title} />

      {/* Three stages of one job, so they sit 22px apart in a single block --
          56px between them would read as three unrelated things that happen
          to be on the same page. An ordered list, because that is what it is:
          the order is the point, and a screen reader should hear "3 of 3"
          rather than three headings that happen to follow each other. */}
      <ol aria-label={tImport.steps} className="grid gap-[22px]">

      <Step
        n={1}
        title={tImport.step1}
        hint={tImport.step1Hint}
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
              {downloading && <Spinner data-icon="inline-start" />}
              {tImport.download}
            </Button>
          </div>
          {templateError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{templateError}</AlertDescription>
            </Alert>
          )}
        </div>
      </Step>

      <Step
        n={2}
        title={tImport.step2}
        hint={tImport.step2Hint}
        state={categoryID === "" ? "waiting" : report ? "done" : "current"}
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-80">
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
              {preview.isPending && <Spinner data-icon="inline-start" aria-hidden />}
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
              <AlertCircleIcon />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )}
        </div>
      </Step>

      {report && (
        <Step n={3} title={tImport.step3} hint={tImport.step3Hint} state="current">
          <div className="grid gap-4">
            <p role="status">
              {tImport.summary(report.ok, report.total)}
              {failing.length === 0 ? (
                <Badge className="ml-2">{tImport.allGood(report.total)}</Badge>
              ) : (
                <Badge variant="outline" className="ml-2">
                  {tImport.hasErrors(failing.length)}
                </Badge>
              )}
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
                        <TableCell className="font-mono">{r.line}</TableCell>
                        <TableCell>
                          <ul className="grid gap-0.5 text-sm">
                            {Object.entries(r.fields ?? {}).map(([k, v]) => (
                              <li key={k}>
                                <span className="font-mono text-muted-foreground">{k}</span>：{v}
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
                {commit.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                {commit.isPending ? tImport.committing : tImport.commit}
              </Button>
            </div>
          </div>
        </Step>
        )}
      </ol>
    </div>
  )
}
