import type { Category } from "@/lib/types"
import type { FieldDefinitionRow, FieldGroupRow, ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
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

import { Fact, Pane } from "@/features/common/Pane"

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
 * pane is what somebody reads before deciding to open it.
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

  return (
    <Pane
      title={field.label}
      tag={field.key}
      action={
        <Button variant="outline" onClick={onEdit} disabled={Boolean(denied)} title={denied ?? undefined}>
          {tMeta.fields.edit}
        </Button>
      }
      facts={
        <>
          <Fact label={tMeta.fields.type}>{tMeta.fieldTypes[field.type] ?? field.type}</Fact>
          {/* Which scope, not just whether: uniqueness holds inside one chain
              or one device's subtree, never globally (v6 decision 71), and
              "unique" on its own would be read as the global promise it is
              not. */}
          <Fact label={tMeta.fields.unique}>
            {field.is_unique
              ? (field.model_ids?.length ?? 0) + (field.vendor_ids?.length ?? 0) > 0
                ? tMeta.fields.uniqueInDevices
                : tMeta.fields.uniqueInCategory
              : t.common.no}
          </Fact>
          {/* The effective answer, not the flag. `Findable()` on the server is
              `Searchable || IsUnique`, and the field form ticks the box and
              locks it for a unique field -- so reading the raw flag here would
              print 否 on a field the search does find.

              And it says which of the two, the way the uniqueness fact says
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
          <Fact label={tMeta.categories.required}>
            {field.required ? t.common.yes : t.common.no}
          </Fact>
          <Fact label={tMeta.panes.inGroups}>
            {inGroups.length > 0 ? (
              inGroups.map((g) => g.name).join("、")
            ) : (
              <span className="text-muted-foreground">{tMeta.panes.noGroups}</span>
            )}
          </Fact>
        </>
      }
    >
      <h3 className="text-[21px] font-bold">{tMeta.panes.bindingsOf}</h3>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map((b) => (
                <TableRow key={`${b.kind}-${b.name}`}>
                  <TableCell>
                    <Badge variant="secondary">{b.kind}</Badge>
                  </TableCell>
                  <TableCell>{b.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Pane>
  )
}
