import type { Category } from "@/lib/types"
import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Fact, Pane } from "@/features/common/Pane"
import { TableFrame } from "@/features/common/TableFrame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * One model: where it comes from, where it is offered, and what it records.
 *
 * The fields are derived from the field list rather than fetched: a field row
 * already says which models and which vendors it is bound to, so "this model's
 * fields" is a filter over data the page is holding anyway. Fetching it again
 * would be a second answer to a question that already has one.
 *
 * Which of them came from the vendor is called out, because that is the half
 * you cannot change from here -- 016 made vendor bindings reach every model
 * live, and a row you can only alter somewhere else should say so.
 */
export function ModelDetail({
  model,
  vendorName,
  categories,
  fields,
  count,
  onEdit,
}: {
  model: ProductModelRow
  vendorName: string
  categories: Category[]
  fields: FieldDefinitionRow[]
  count: number
  onEdit: () => void
}) {
  const { deniedReason } = usePermissions()
  const denied = deniedReason("model.manage")

  const own = fields.filter((f) => (f.model_ids ?? []).includes(model.id))
  const inherited = model.vendor_id
    ? fields.filter((f) => (f.vendor_ids ?? []).includes(model.vendor_id as string))
    : []
  const rows = [
    ...inherited.map((f) => ({ f, from: tMeta.panes.fromVendor })),
    ...own.map((f) => ({ f, from: tMeta.panes.fromModel })),
  ]

  return (
    <Pane
      title={model.name}
      tag={vendorName}
      action={
        <Button variant="outline" onClick={onEdit} disabled={Boolean(denied)} title={denied ?? undefined}>
          {tMeta.models.edit}
        </Button>
      }
      facts={
        <>
          <Fact label={tMeta.models.vendor}>
            {vendorName || <span className="text-muted-foreground">{tMeta.panes.noVendor}</span>}
          </Fact>
          <Fact label={tMeta.models.category}>
            {model.category_ids.length > 0 ? (
              model.category_ids
                .map((id) => categories.find((c) => c.id === id)?.name ?? id)
                .join("、")
            ) : (
              <span className="text-muted-foreground">{tMeta.models.noCategory}</span>
            )}
          </Fact>
          <Fact label={t.assets.title}>{tMeta.panes.devicesOn(count)}</Fact>
          <Fact label={tMeta.models.defaults}>
            {Object.keys(model.attr_defaults ?? {}).length}
          </Fact>
          {/* In the band with the rest, but across it: "已停产，改买 5430" is
              a sentence, and a quarter of the width turns it into four short
              lines that no longer read like one. Absent when empty -- a
              labelled blank claims somebody looked and had nothing to say.

              It was on the old table until 025 dropped it here, along with the
              test that would have said so. */}
          {model.note && (
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-muted-foreground mb-1 text-[13px]">{tMeta.models.note}</dt>
              <dd className="text-[15px]">{model.note}</dd>
            </div>
          )}
        </>
      }
    >
      <h3 className="text-[21px] font-bold">{tMeta.panes.modelFields}</h3>
      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{tMeta.panes.noFields}</EmptyTitle>
            <EmptyDescription>{tMeta.categories.bindElsewhere}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tMeta.fields.label}</TableHead>
                <TableHead>{tMeta.fields.key}</TableHead>
                <TableHead>{tMeta.fields.type}</TableHead>
                <TableHead>{tMeta.categories.inheritedFrom}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ f, from }) => (
                <TableRow key={f.id} aria-label={f.label}>
                  <TableCell>{f.label}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[13px]">
                    {f.key}
                  </TableCell>
                  <TableCell>{tMeta.fieldTypes[f.type] ?? f.type}</TableCell>
                  <TableCell>
                    <Badge variant={from === tMeta.panes.fromVendor ? "secondary" : "outline"}>
                      {from}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Pane>
  )
}
