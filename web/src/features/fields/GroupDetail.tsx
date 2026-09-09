import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/metaTypes"
import { tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Hint } from "@/features/common/Hint"
import { Fact, Pane } from "@/features/common/Pane"
import { TableFrame } from "@/features/common/TableFrame"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * A group: a name, the fields in it, and nothing about where it is bound.
 *
 * Nothing about where it is bound because there is nothing to say. Binding a
 * group writes the same rows as binding its members one at a time and leaves
 * no trace of the group (016, decision 105) -- so an empty list here would be
 * a claim, not an absence. The editor is where a group is bound, because there
 * it is an act rather than a state.
 */
export function GroupDetail({
  group,
  fields,
  onEdit,
}: {
  group: FieldGroupRow
  fields: FieldDefinitionRow[]
  onEdit: () => void
}) {
  const { deniedReason } = usePermissions()
  const denied = deniedReason("schema.manage")
  const members = (group.field_ids ?? [])
    .map((id) => fields.find((f) => f.id === id))
    .filter(Boolean) as FieldDefinitionRow[]

  return (
    <Pane
      title={group.name}
      action={
        <Button variant="outline" onClick={onEdit} disabled={Boolean(denied)} title={denied ?? undefined}>
          {tMeta.fieldGroups.edit}
        </Button>
      }
      facts={
        <>
          <Fact label={tMeta.fieldGroups.memberCount}>{members.length}</Fact>
        </>
      }
    >
      <div className="flex items-center gap-1.5">
        <h3 className="text-[21px] font-bold">{tMeta.panes.groupMembers}</h3>
        <Hint>{tMeta.fieldGroups.bindFromEditor}</Hint>
      </div>
      {members.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{tMeta.fieldGroups.empty}</EmptyTitle>
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
              {members.map((f) => (
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
    </Pane>
  )
}
