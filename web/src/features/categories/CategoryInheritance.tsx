import { InheritanceImpact } from "./InheritanceImpact"
import { t, tMeta } from "@/i18n"
import { ApiError } from "@/lib/api"
import type { Category } from "@/lib/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { FieldSet, FieldLegend, FieldError } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableRow, TableCell, TableHeader, TableHead } from "@/components/ui/table"
import { Hint } from "@/features/common/Hint"
import { Pager } from "@/features/common/Pager"
import { TableFrame } from "@/features/common/TableFrame"
import type { PreviewSection, useCategoryDraft } from "./useCategoryDraft"

interface Props {
  state: ReturnType<typeof useCategoryDraft>
  categories: Category[]
  disabled: boolean
  fieldError?: string
}

/** Category business UI; no binding mutations or independent checkbox writes. */
export function CategoryInheritance({ state, categories, disabled, fieldError }: Props) {
  const { draft, preview, loading, error } = state
  const text = tMeta.categories.inheritance
  const pathName = (id: string) => {
    const category = categories.find((c) => c.id === id)
    return category ? category.path.split("/").filter(Boolean).map((part) => categories.find((c) => c.id === part)?.name ?? part).join(" / ") : id
  }
  const pager = (section: PreviewSection, total: number) => <Pager page={state.pages[section].page} pageSize={state.pages[section].size} total={total} onPage={(page) => state.setPage(section, page)} onPageSize={(size) => state.setPageSize(section, size)} />
  const selection = draft.inherited_field_ids ?? []
  return <FieldSet aria-label={text.title} className="min-w-0">
    <div className="flex items-center gap-1.5"><FieldLegend variant="label" className="mb-0">{text.title}</FieldLegend><Hint>{text.hint}</Hint></div>
    {fieldError && <FieldError>{fieldError}</FieldError>}
    {loading && <div role="status" aria-label={text.loading}><Skeleton className="h-8 w-full" /></div>}
    {!!error && <Alert variant="destructive"><AlertDescription>
      {error instanceof ApiError ? error.message : t.common.error}
      <Button variant="outline" size="sm" onClick={state.retry}>{text.retry}</Button>
    </AlertDescription></Alert>}
    {preview && <>
      {preview.inheritance.candidates.total === 0 ? <Empty><EmptyHeader><EmptyTitle>{text.empty}</EmptyTitle><EmptyDescription>{text.emptyHint}</EmptyDescription></EmptyHeader></Empty> :
        <TableFrame footer={pager("candidates", preview.inheritance.candidates.total)}>
          <Table><TableHeader><TableRow><TableHead>{text.title}</TableHead><TableHead>{text.type}</TableHead><TableHead>{tMeta.categories.required}</TableHead><TableHead>{text.source}</TableHead></TableRow></TableHeader>
            <TableBody>{preview.inheritance.candidates.items.map(({ field, source_category_id }) => <TableRow key={field.id}>
              <TableCell><Checkbox aria-label={field.label} checked={selection.includes(field.id)} disabled={disabled || loading || !!error} onCheckedChange={(checked) => state.change({ inherited_field_ids: checked ? [...selection, field.id] : selection.filter((id) => id !== field.id) })} /> <span>{field.label}</span><code className="ml-1 text-xs text-muted-foreground">{field.key}</code></TableCell>
              <TableCell>{tMeta.fieldTypes[field.type]}</TableCell><TableCell>{field.required ? tMeta.categories.required : text.optional}</TableCell><TableCell className="whitespace-normal break-words">{pathName(source_category_id)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableFrame>}
      {preview.requires_confirmation && !preview.confirmation_token && <Alert><AlertDescription>{text.blocked}</AlertDescription></Alert>}
      <InheritanceImpact preview={preview} categories={categories} onPage={state.setPage} onPageSize={state.setPageSize} />
    </>}
  </FieldSet>
}
