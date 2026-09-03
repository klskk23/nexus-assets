import { AlertCircleIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { api, ApiError, download } from "@/lib/api"
import type { Category } from "@/lib/types"
import { t, tImport } from "@/i18n"
import { TableFrame } from "@/features/common/TableFrame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

/** The two steps send the same thing: a category and a file. */
function upload(path: string, categoryID: string, file: File): Promise<Report> {
  const body = new FormData()
  body.append("category_id", categoryID)
  body.append("file", file)
  return api.upload<Report>(path, body)
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
    mutationFn: () => upload("/import/preview", categoryID, file!),
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
    mutationFn: () => upload("/import/commit", categoryID, file!),
    onSuccess: (r) => {
      setReport(null)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ""
      setBanner(tImport.done(r.ok ?? 0))
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
    <div className="grid max-w-4xl gap-6">
      <PageHeader title={tImport.title} />

      <Card>
        <CardHeader>
          <CardTitle>{tImport.step1}</CardTitle>
          <CardDescription>{tImport.step1Hint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tImport.step2}</CardTitle>
          <CardDescription>{tImport.step2Hint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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
              onClick={() => preview.mutate()}
            >
              {preview.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {preview.isPending ? tImport.previewing : tImport.preview}
            </Button>
          </div>

          {banner && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>{tImport.step3}</CardTitle>
            <CardDescription>{tImport.step3Hint}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
