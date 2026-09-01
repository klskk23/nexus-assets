import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { ApiError, api, download } from "@/lib/api"
import type { Category, CategorySchema } from "@/lib/types"
import { t, tImport } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The filters the list is showing, minus the category, which is asked here. */
  params: URLSearchParams
  /** The category the page is filtered by, which is only a starting point. */
  categoryId: string
  includeDescendants: boolean
}

/**
 * Asks the two questions a CSV of devices cannot be written without.
 *
 * Which category, because the columns past the fixed six are that category's
 * own vocabulary -- a mixed export is a spreadsheet with nothing in it that
 * tells two devices apart. And which of its fields, because a category with
 * forty of them makes a file nobody can read across.
 *
 * The rest of the filters come from the page as they are: what is exported is
 * what is on screen, narrowed to one kind of thing.
 */
export function ExportDialog({
  open,
  onOpenChange,
  params,
  categoryId,
  includeDescendants,
}: Props) {
  const [chosen, setChosen] = useState(categoryId)
  const [keys, setKeys] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reopening starts from what the page is filtered by rather than from last
  // time: the export follows the list, which is why it is on that page.
  useEffect(() => {
    if (open) {
      setChosen(categoryId)
      setError(null)
    }
  }, [open, categoryId])

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
    enabled: open,
  })

  const schema = useQuery({
    queryKey: ["schema", chosen],
    queryFn: () => api.get<CategorySchema>(`/categories/${chosen}/schema`),
    enabled: open && chosen !== "",
  })

  const fields = schema.data?.fields ?? []
  // Everything, until somebody says otherwise: a person who wants the lot -- the
  // common case -- should not have to tick forty boxes to get it.
  const selected = keys ?? fields.map((f) => f.key)

  const toggle = (key: string) =>
    setKeys(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])

  const run = async () => {
    const q = new URLSearchParams(params)
    q.set("category_id", chosen)
    q.set("include_descendants", String(includeDescendants))
    // Sent whatever was ticked, empty included: "the fixed columns only" is a
    // request the server can hear, and leaving it out would mean "all of them".
    q.set("fields", selected.join(","))
    setBusy(true)
    setError(null)
    try {
      await download(`/export.csv?${q.toString()}`, "assets.csv")
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tImport.exportFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tImport.exportTitle}</DialogTitle>
          <DialogDescription>{tImport.exportIntro}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="export-category">{tImport.exportCategory}</FieldLabel>
            <Select value={chosen} onValueChange={(v) => (setChosen(v), setKeys(null))}>
              <SelectTrigger id="export-category">
                <SelectValue placeholder={tImport.exportPickCategory} />
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

          <FieldSet>
            <FieldLegend variant="label">{tImport.exportFields}</FieldLegend>
            <FieldDescription>{tImport.exportFieldsHint}</FieldDescription>
            {chosen === "" ? null : schema.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : fields.length === 0 ? (
              <FieldDescription>{tImport.exportNoFields}</FieldDescription>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setKeys(null)}>
                    {tImport.exportAll}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setKeys([])}>
                    {tImport.exportNone}
                  </Button>
                </div>
                <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto">
                  {fields.map((f) => (
                    <Field key={f.key} orientation="horizontal">
                      <Checkbox
                        id={`export-${f.key}`}
                        checked={selected.includes(f.key)}
                        onCheckedChange={() => toggle(f.key)}
                      />
                      <FieldLabel htmlFor={`export-${f.key}`} className="font-normal">
                        {f.label}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </>
            )}
          </FieldSet>

          {/* In the dialog, because the page behind it is hidden from a reader
              and covered for everyone else. */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t.common.cancel}</Button>
          </DialogClose>
          <Button onClick={run} disabled={chosen === "" || busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {tImport.exportGo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
