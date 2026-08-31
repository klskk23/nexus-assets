import { AlertCircleIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"

import { api, ApiError, getToken } from "@/lib/api"
import type { Category } from "@/lib/types"
import { t, tImport } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

/** Sends a multipart upload; the API client only speaks JSON. */
async function upload(path: string, categoryID: string, file: File): Promise<Report> {
  const body = new FormData()
  body.append("category_id", categoryID)
  body.append("file", file)

  const token = getToken()
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  })
  const payload = await res.json()
  if (!res.ok) {
    const e = payload?.error ?? {}
    // A refused commit still carries the report, so the page can keep showing
    // exactly which lines are in the way.
    const err = new ApiError(res.status, e.code ?? "internal_error", e.message ?? t.common.error)
    ;(err as ApiError & { report?: Report }).report = payload?.report
    throw err
  }
  return payload as Report
}

export function Import() {
  const [categoryID, setCategoryID] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
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
      const withReport = e as ApiError & { report?: Report }
      if (withReport.report) setReport(withReport.report)
      setBanner(e instanceof ApiError ? e.message : t.common.error)
    },
  })

  const failing = report?.rows.filter((r) => r.status === "error") ?? []
  const canPreview = categoryID !== "" && file !== null
  const canCommit = report !== null && report.ok === report.total && report.total > 0

  return (
    <div className="grid max-w-4xl gap-6">
      <h1 className="text-xl font-semibold">{tImport.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{tImport.step1}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">{tImport.step1Hint}</p>
          <div className="flex flex-wrap items-end gap-4">
            <Field>
              <FieldLabel htmlFor="im-category">{tImport.category}</FieldLabel>
              <Select
                value={categoryID}
                onValueChange={(v) => {
                  setCategoryID(v)
                  setReport(null)
                }}
              >
                <SelectTrigger id="im-category" className="w-56">
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
            {/* An anchor ignores `disabled`, so without a category selected we
                render a real button instead of a live link to a broken URL. */}
            {categoryID === "" ? (
              <Button variant="outline" className="mb-0.5" disabled>
                {tImport.download}
              </Button>
            ) : (
              <Button variant="outline" className="mb-0.5" asChild>
                <a href={`/api/categories/${categoryID}/import-template.csv`} download>
                  {tImport.download}
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tImport.step2}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">{tImport.step2Hint}</p>
          <div className="flex flex-wrap items-end gap-4">
            <Field>
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
              className="mb-0.5"
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
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">{tImport.step3Hint}</p>

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
              <div className="overflow-x-auto rounded-md border">
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
              </div>
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
