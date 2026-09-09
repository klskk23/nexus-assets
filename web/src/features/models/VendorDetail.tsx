import type { FieldDefinitionRow, VendorRow } from "@/lib/metaTypes"
import { tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Fact, Pane } from "@/features/common/Pane"
import { TableFrame } from "@/features/common/TableFrame"
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
 * A vendor: its models, and the fields every one of them inherits.
 *
 * Two permissions on one pane, and deliberately not merged into one. Renaming
 * a vendor needs `model.manage`; binding a field to it needs `schema.manage`,
 * because a field bound here reaches every model underneath and that is a
 * change to what devices record. 023 split those apart on exactly that
 * argument -- somebody who manages models should be able to fix a vendor's
 * name without being able to reshape the ledger. Asking for both here would
 * quietly undo it.
 *
 * So each control answers for itself, and a reader who can do one of the two
 * sees the other explained rather than missing.
 */
export function VendorDetail({
  vendor,
  modelCount,
  fields,
  onEdit,
}: {
  vendor: VendorRow
  modelCount: number
  fields: FieldDefinitionRow[]
  onEdit: () => void
}) {
  const { deniedReason } = usePermissions()
  const deniedRename = deniedReason("model.manage")
  const deniedBind = deniedReason("schema.manage")
  const bound = fields.filter((f) => (f.vendor_ids ?? []).includes(vendor.id))

  return (
    <Pane
      title={vendor.name}
      action={
        <Button
          variant="outline"
          onClick={onEdit}
          disabled={Boolean(deniedRename)}
          title={deniedRename ?? undefined}
        >
          {tMeta.vendors.edit}
        </Button>
      }
      facts={
        <>
          <Fact label={tMeta.vendors.modelCount}>{modelCount}</Fact>
          <Fact label={tMeta.panes.vendorFields}>{bound.length}</Fact>
        </>
      }
    >
      <h3 className="text-[21px] font-bold">{tMeta.panes.vendorFields}</h3>
      {bound.length === 0 ? (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {bound.map((f) => (
                <TableRow key={f.id} aria-label={f.label}>
                  <TableCell>{f.label}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[13px]">
                    {f.key}
                  </TableCell>
                  <TableCell>{tMeta.fieldTypes[f.type] ?? f.type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      {/* The other half of the permission, said where the thing it governs
          is, and only when it is missing. Binding reaches every model under
          this vendor, which is why it asks for schema.manage while the rename
          above does not -- and why "you cannot do this" is two different
          sentences on one pane. Where binding happens is already said in the
          empty state; repeating it here was the page telling you twice. */}
      {deniedBind && (
        <p className="text-muted-foreground text-[13px]">{deniedBind}</p>
      )}
    </Pane>
  )
}
