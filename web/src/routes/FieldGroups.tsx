import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/metaTypes"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import { Hint } from "@/features/common/Hint"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"

/** The whole library, for the member checkboxes. */
function useFieldLibrary() {
  const q = useQuery({
    queryKey: ["fields", "all"],
    queryFn: () => api.get<ListPage<FieldDefinitionRow>>("/fields?limit=500"),
  })
  return q.data?.items ?? []
}

/** Ticks the members of a group, in one visible grid rather than behind a scroll. */
function MemberPicker({
  idPrefix,
  fields,
  value,
  onChange,
}: {
  idPrefix: string
  fields: FieldDefinitionRow[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <FieldSet>
      <div className="mb-3 flex items-center gap-1.5">
        <FieldLegend variant="label" className="mb-0">
          {tMeta.fieldGroups.members}
        </FieldLegend>
        <Hint>{tMeta.fieldGroups.membersHint}</Hint>
      </div>
      <FieldGroup className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto">
        {fields.map((f) => (
          <Field key={f.id} orientation="horizontal" className="w-auto">
            <Checkbox
              id={`${idPrefix}-${f.id}`}
              checked={value.includes(f.id)}
              onCheckedChange={(v) =>
                onChange(v === true ? [...value, f.id] : value.filter((id) => id !== f.id))
              }
            />
            <FieldLabel htmlFor={`${idPrefix}-${f.id}`} className="font-normal">
              {f.label}
            </FieldLabel>
          </Field>
        ))}
      </FieldGroup>
    </FieldSet>
  )
}

/**
 * Field groups: a name for a handful of fields, so they can be bound in one act.
 *
 * The group is a shortcut and nothing else. Binding it writes the same rows as
 * binding its members one at a time, and there is no way to unbind a group --
 * the expansion leaves no trace to reverse, which the delete confirmation says
 * in as many words (016, decision 105).
 */
export function FieldGroups() {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [editing, setEditing] = useState<FieldGroupRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [members, setMembers] = useState<string[]>([])
  const fields = useFieldLibrary()
  const labelOf = (id: string) => fields.find((f) => f.id === id)?.label ?? id

  const invalidate = () => {
    setNotice(null)
    queryClient.invalidateQueries({ queryKey: ["field-groups"] })
    // The field list shows which groups each field is in.
    queryClient.invalidateQueries({ queryKey: ["fields"] })
  }
  const fail = (e: unknown) => setNotice(e instanceof ApiError ? e.message : t.common.error)

  const save = useMutation({
    mutationFn: (g: FieldGroupRow) =>
      api.patch(`/field-groups/${g.id}`, { name: g.name, field_ids: g.field_ids }),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/field-groups/${id}`),
    onSuccess: invalidate,
    onError: fail,
  })

  return (
    <>
      <CrudPage<FieldGroupRow>
        title={tMeta.fieldGroups.title}
        queryKey="field-groups"
        searchHint={tMeta.fieldGroups.searchHint}
        list={(params) => api.get<ListPage<FieldGroupRow>>(`/field-groups?${params}`)}
        createLabel={tMeta.fieldGroups.create}
        createDeniedReason={deniedReason("schema.manage")}
        createDisabled={name === ""}
        onCreated={() => {
          setName("")
          setMembers([])
        }}
        create={() => api.post("/field-groups", { name, field_ids: members })}
        notice={
          notice && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )
        }
        onRowClick={(g) => setEditing(g)}
        rowActions={[
          { label: tMeta.fieldGroups.edit, onSelect: (g) => setEditing(g) },
          {
            label: tMeta.fieldGroups.delete,
            destructive: true,
            onSelect: (g) => remove.mutate(g.id),
            confirm: (g) => ({
              title: tMeta.fieldGroups.deleteTitle,
              description: tMeta.fieldGroups.deleteHint(g.name),
              phrase: g.name,
            }),
          },
        ]}
        emptyTitle={tMeta.fieldGroups.empty}
        emptyHint={tMeta.fieldGroups.emptyHint}
        columns={[
          { header: tMeta.fieldGroups.name, cell: (g) => g.name },
          {
            header: tMeta.fieldGroups.memberCount,
            cell: (g) => <span className="tabular-nums">{g.field_ids?.length ?? 0}</span>,
          },
          {
            header: tMeta.fieldGroups.members,
            cell: (g) => (g.field_ids ?? []).map(labelOf).join("、"),
          },
        ]}
        form={
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="g-name">{tMeta.fieldGroups.name}</FieldLabel>
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <MemberPicker idPrefix="g-member" fields={fields} value={members} onChange={setMembers} />
          </FieldGroup>
        }
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tMeta.fieldGroups.editTitle}</DialogTitle>
          </DialogHeader>
          {editing && (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ge-name">{tMeta.fieldGroups.name}</FieldLabel>
                <Input
                  id="ge-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
              <MemberPicker
                idPrefix="ge-member"
                fields={fields}
                value={editing.field_ids ?? []}
                onChange={(ids) => setEditing({ ...editing, field_ids: ids })}
              />
            </FieldGroup>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t.common.cancel}</Button>
            </DialogClose>
            <Button
              disabled={!editing || editing.name === "" || save.isPending}
              onClick={() => editing && save.mutate(editing)}
            >
              {tMeta.fieldGroups.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
