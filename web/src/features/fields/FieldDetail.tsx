import type { Category } from "@/lib/types"
import type { FieldDefinitionRow, FieldGroupRow, ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { t, tExprHelp, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { TableFrame } from "@/features/common/TableFrame"
import { ExpressionHelp } from "@/features/fields/ExpressionHelp"
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

import { Fact, Pane, PaneHeading } from "@/features/common/Pane"

interface Props {
  field: FieldDefinitionRow
  groups: FieldGroupRow[]
  categories: Category[]
  models: ProductModelRow[]
  vendors: VendorRow[]
  onEdit: () => void
}

/**
 * What one field is, and everywhere it is in use.
 *
 * "Where is this field bound" used to need the edit dialog, and "which groups
 * is it in" used to need the other tab. Both are facts about the field, so
 * both belong on the field.
 *
 * Read-only. Binding is answered on the field's own editor, where the question
 * "where does this belong" is actually being asked (v6 decision 72), and this
 * pane is what somebody reads before deciding to open it. The prototype draws
 * an unbind button per row and a "bind to a category" verb under the table;
 * neither is here (030, decision 218) -- the rule that binding is an act done
 * in the dialog outranks the drawing.
 *
 * Handoff §6: the type and uniqueness ride beside the title as tags, so the
 * facts band is left with the four things that are prose -- where it is
 * bound, whether search reaches it, which groups hold it, and what it checks.
 */
export function FieldDetail({ field, groups, categories, models, vendors, onEdit }: Props) {
  const { deniedReason } = usePermissions()
  const denied = deniedReason("schema.manage")
  const nameOf = <T extends { id: string; name: string }>(list: T[], id: string) =>
    list.find((x) => x.id === id)?.name ?? id

  const bindings = [
    ...(field.category_ids ?? []).map((id) => ({
      kind: tMeta.panes.kindCategory,
      name: nameOf(categories, id),
    })),
    ...(field.model_ids ?? []).map((id) => ({
      kind: tMeta.panes.kindModel,
      name: nameOf(models, id),
    })),
    ...(field.vendor_ids ?? []).map((id) => ({
      kind: tMeta.panes.kindVendor,
      name: nameOf(vendors, id),
    })),
  ]
  const inGroups = groups.filter((g) => (g.field_ids ?? []).includes(field.id))

  // Which side, from the bindings rather than the flag: the flag is what the
  // server last wrote and the lists are what the pane is about to show, and
  // a pane that says "category" above a table of models is two claims.
  const boundTo =
    (field.category_ids?.length ?? 0) > 0
      ? tMeta.fields.bindByCategory
      : (field.model_ids?.length ?? 0) + (field.vendor_ids?.length ?? 0) > 0
        ? tMeta.fields.bindByDevice
        : tMeta.fields.unbound

  // The rule in the shape somebody typed it. A regex reads as itself; a range
  // reads as its two ends, an open end shown as nothing rather than as a
  // number that was never entered.
  const o = field.options ?? {}
  const rule = o.regex
    ? o.regex
    : o.min != null || o.max != null
      ? [tMeta.panes.rangeOf(o.min?.toString() ?? "", o.max?.toString() ?? ""), o.unit]
          .filter(Boolean)
          .join(" ")
      : null

  return (
    <Pane
      title={field.label}
      tag={field.key}
      badges={
        <>
          <Badge variant="secondary">{tMeta.fieldTypes[field.type] ?? field.type}</Badge>
          {/* Which scope, not just whether: uniqueness holds inside one chain
              or one device's subtree, never globally (v6 decision 71), and
              "unique" on its own would be read as the global promise it is
              not. */}
          {field.is_unique && (
            <Badge variant="outline">
              {(field.model_ids?.length ?? 0) + (field.vendor_ids?.length ?? 0) > 0
                ? tMeta.fields.uniqueInDevices
                : tMeta.fields.uniqueInCategory}
            </Badge>
          )}
        </>
      }
      action={
        <Button
          variant="secondary"
          onClick={onEdit}
          disabled={Boolean(denied)}
          title={denied ?? undefined}
        >
          {tMeta.fields.edit}
        </Button>
      }
      facts={
        <>
          <Fact label={tMeta.fields.bindingMode}>{boundTo}</Fact>
          {/* The effective answer, not the flag. `Findable()` on the server is
              `Searchable || IsUnique`, and the field form ticks the box and
              locks it for a unique field -- so reading the raw flag here would
              print 否 on a field the search does find.

              And it says which of the two, the way the uniqueness tag says
              which scope rather than just 是: somebody who drops uniqueness on
              a field whose own switch is off would otherwise watch it quietly
              stop being findable. */}
          <Fact label={tMeta.fields.searchable}>
            {field.is_unique
              ? tMeta.fields.searchableWithUnique
              : field.searchable
                ? t.common.yes
                : t.common.no}
          </Fact>
          <Fact label={tMeta.panes.inGroups}>
            {inGroups.length > 0 ? (
              inGroups.map((g) => g.name).join("、")
            ) : (
              <span className="text-muted-foreground">{tMeta.panes.noGroups}</span>
            )}
          </Fact>
          <Fact label={tMeta.panes.validation}>
            {rule ? (
              <span className="font-mono text-[12.5px] [overflow-wrap:anywhere]">{rule}</span>
            ) : (
              <span className="text-muted-foreground">{t.common.none}</span>
            )}
          </Fact>
        </>
      }
    >
      {o.template && (
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2.5">
            <PaneHeading>{tMeta.panes.expression}</PaneHeading>
            <ExpressionHelp
              trigger={
                <Button variant="link" size="sm" className="h-auto p-0 text-[12.5px]" type="button">
                  {tExprHelp.open}
                </Button>
              }
            />
          </div>
          <code className="bg-well border-primary text-accent-300 block rounded-md border-l-2 p-[10px_14px] font-mono text-[13px] [overflow-wrap:anywhere]">
            {o.template}
          </code>
        </div>
      )}

      <div className="grid gap-2">
        <PaneHeading>{tMeta.panes.bindingsOf}</PaneHeading>
        {bindings.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{tMeta.fields.unbound}</EmptyTitle>
              <EmptyDescription>{tMeta.categories.bindElsewhere}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tMeta.panes.bindKind}</TableHead>
                  <TableHead>{tMeta.panes.bindTarget}</TableHead>
                  <TableHead>{tMeta.categories.required}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bindings.map((b) => (
                  <TableRow key={`${b.kind}-${b.name}`}>
                    <TableCell className="text-neutral-400">{b.kind}</TableCell>
                    <TableCell>{b.name}</TableCell>
                    {/* The field's own flag on every row (018): "required in
                        some of them" was a question nobody could answer, so
                        there is one answer and every row gives it. */}
                    <TableCell>
                      {field.required ? (
                        <Badge variant="outline">{tMeta.categories.required}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </Pane>
  )
}
