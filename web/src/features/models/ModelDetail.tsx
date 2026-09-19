import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Pane, PaneHeading } from "@/features/common/Pane"
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
 *
 * Handoff §7: no facts band. The vendor and the count ride beside the name,
 * the note is a paragraph under it, and the two things a model *has* -- its
 * defaults and its fields -- sit side by side in two columns.
 */
export function ModelDetail({
  model,
  vendorName,
  fields,
  count,
  onEdit,
}: {
  model: ProductModelRow
  vendorName: string
  fields: FieldDefinitionRow[]
  count: number
  onEdit: () => void
}) {
  const { deniedReason } = usePermissions()
  const denied = deniedReason("model.manage")

  /**
   * One row per field, however many ways it got here.
   *
   * A field bound to this model **and** to its vendor used to be listed twice,
   * once under each heading -- two rows for one field, with the same React key
   * on both, which is how it went unnoticed. It is one field: the entry form
   * asks for it once, and the server's schema returns it once.
   *
   * But it is not enough to keep one and drop the other, because the label is
   * load-bearing. Saying only 厂商 tells somebody that unbinding the vendor
   * takes this field off the model, and it does not -- the direct binding
   * keeps it. Saying only 本型号 lies the other way. So the row names every
   * route the field took, and unbinding one of them is visibly not the whole
   * story.
   *
   * Different from the field pane, which lists each binding target on its own
   * row (025): there the rows are different targets. Here they would be the
   * same field twice.
   */
  const from = new Map<string, { f: FieldDefinitionRow; sources: string[] }>()
  const reached = (f: FieldDefinitionRow, source: string) => {
    const seen = from.get(f.id)
    if (seen) seen.sources.push(source)
    else from.set(f.id, { f, sources: [source] })
  }
  if (model.vendor_id) {
    for (const f of fields) {
      if ((f.vendor_ids ?? []).includes(model.vendor_id)) reached(f, tMeta.panes.fromVendor)
    }
  }
  for (const f of fields) {
    if ((f.model_ids ?? []).includes(model.id)) reached(f, tMeta.panes.fromModel)
  }
  const rows = [...from.values()]
  const defaults = Object.entries(model.attr_defaults ?? {})

  return (
    <Pane
      title={model.name}
      badges={
        <>
          <span className="text-neutral-400 text-[13px]">
            {vendorName || tMeta.panes.noVendor}
          </span>
          <Badge variant="secondary">{tMeta.panes.devicesOn(count)}</Badge>
        </>
      }
      action={
        <Button
          variant="secondary"
          onClick={onEdit}
          disabled={Boolean(denied)}
          title={denied ?? undefined}
        >
          {tMeta.models.edit}
        </Button>
      }
    >
      {/* Absent when empty -- a labelled blank claims somebody looked and had
          nothing to say. It was on the old table until 025 dropped it here,
          along with the test that would have said so. */}
      {model.note && <p className="text-neutral-300 text-sm">{model.note}</p>}

      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="grid gap-2">
          <PaneHeading>
            {tMeta.models.defaults}
            <span className="text-neutral-500 ml-1.5 text-xs font-normal">
              {tMeta.models.defaultsShort}
            </span>
          </PaneHeading>
          {/* A sentence rather than an empty table: two column heads over
              nothing is a table that forgot to load. */}
          {defaults.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.common.none}</p>
          ) : (
            <TableFrame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tMeta.models.defaultKey}</TableHead>
                    <TableHead>{tMeta.models.defaultValue}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defaults.map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="text-neutral-400 font-mono text-[12.5px]">
                        {key}
                      </TableCell>
                      <TableCell className="tabular-nums">{String(value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          )}
        </div>

        <div className="grid gap-2">
          <PaneHeading>{tMeta.panes.modelFields}</PaneHeading>
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
                    <TableHead>{tMeta.panes.source}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ f, sources }) => (
                    <TableRow key={f.id} aria-label={f.label}>
                      <TableCell>{f.label}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {sources.map((source) => (
                            <Badge
                              key={source}
                              variant={source === tMeta.panes.fromVendor ? "secondary" : "outline"}
                            >
                              {source}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          )}
        </div>
      </div>
    </Pane>
  )
}
