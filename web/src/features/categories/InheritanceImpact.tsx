import { Link } from "react-router"
import type { Category, CategoryPreview } from "@/lib/types"
import { tMeta } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FieldSet, FieldLegend } from "@/components/ui/field"
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table"
import { Pager } from "@/features/common/Pager"
import { TableFrame } from "@/features/common/TableFrame"

export function InheritanceImpact({ preview, categories, onPage, onPageSize }: {
  preview: CategoryPreview
  categories: Category[]
  onPage: (section: "impact" | "issues", page: number) => void
  onPageSize: (section: "impact" | "issues", size: number) => void
}) {
  const text = tMeta.categories.inheritance
  const pathName = (id: string) => {
    const category = categories.find((c) => c.id === id)
    return category ? category.path.split("/").filter(Boolean).map((part) => categories.find((c) => c.id === part)?.name ?? part).join(" / ") : id
  }
  const labels = { added: text.added, removed: text.removed, source_changed: text.source_changed }
  const pager = (section: "impact" | "issues") => {
    const page = preview[section]
    return <Pager page={Math.floor(page.offset / page.limit)} pageSize={page.limit} total={page.total} onPage={(n) => onPage(section, n)} onPageSize={(n) => onPageSize(section, n)} />
  }
  return <>
    {preview.impact.total > 0 && <FieldSet aria-label={text.impact} className="min-w-0">
      <FieldLegend variant="label">{text.impact}</FieldLegend>
      <Alert><AlertDescription>{text.summary(preview.impact.category_count, preview.impact.asset_count)}</AlertDescription></Alert>
      <TableFrame footer={pager("impact")}><Table><TableBody>{preview.impact.items.map((item) => <TableRow key={`${item.category_id}-${item.field_id}`}><TableCell className="whitespace-normal break-words"><Link to={`/categories/${item.category_id}`}>{pathName(item.category_id)}</Link></TableCell><TableCell className="break-all"><Link to={`/fields/${item.field_id}`}>{item.key}</Link></TableCell><TableCell>{labels[item.change]}</TableCell></TableRow>)}</TableBody></Table></TableFrame>
    </FieldSet>}
    {preview.issues.total > 0 && <FieldSet aria-label={text.issues} className="min-w-0">
      <FieldLegend variant="label">{text.issues}</FieldLegend>
      <Alert variant="destructive"><AlertDescription><ul className="grid gap-2 break-all">{preview.issues.items.map((issue, i) => <li key={i}>
        {issue.message}{" "}
        {issue.category_id && <Link className="underline" to={`/categories/${issue.category_id}`}>{pathName(issue.category_id)}</Link>}{" "}
        {issue.field_id ? <Link className="underline" to={`/fields/${issue.field_id}`}>{issue.field_key ?? issue.field_id}</Link> : issue.field_key}{" "}
        {issue.asset_id && <Link className="underline" to={`/assets/${issue.asset_id}`}>{issue.asset_id}</Link>}{" "}
        {issue.conflict_asset_id && <Link className="underline" to={`/assets/${issue.conflict_asset_id}`}>{issue.conflict_asset_id}</Link>}
      </li>)}</ul></AlertDescription></Alert>
      {pager("issues")}
    </FieldSet>}
  </>
}
