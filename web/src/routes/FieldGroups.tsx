import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Category } from "@/lib/types"
import type {
  FieldDefinitionRow,
  FieldGroupRow,
  ProductModelRow,
  VendorRow,
} from "@/lib/metaTypes"
import { BindingPicker, type BindingValue } from "@/features/fields/BindingPicker"

/** A form that has not been asked to bind anything yet. */
const NO_BINDING: BindingValue = { bindMode: "category", bindTo: [], bindVendors: [] }

/** The three lists, the way both the create and the bind request want them. */
function bindingBody(b: BindingValue) {
  return {
    category_ids: b.bindMode === "category" ? b.bindTo : [],
    model_ids: b.bindMode === "device" ? b.bindTo : [],
    vendor_ids: b.bindMode === "device" ? b.bindVendors : [],
  }
}

/** Everything ticked, for the "was anything asked for" check. */
function targetsOf(b: BindingValue) {
  const body = bindingBody(b)
  return [...body.category_ids, ...body.model_ids, ...body.vendor_ids]
}
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import { Hint } from "@/features/common/Hint"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { MetadataTabs } from "@/features/metadata/MetadataTabs"
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
  FieldDescription,
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

/** Name, members and where to bind -- the same form, whichever dialog it is in. */
function GroupForm({
  idPrefix,
  name,
  onName,
  members,
  onMembers,
  fields,
  binds,
  onBinds,
  categories,
  models,
  vendors,
  bindNote,
}: {
  idPrefix: string
  name: string
  onName: (v: string) => void
  members: string[]
  onMembers: (ids: string[]) => void
  fields: FieldDefinitionRow[]
  binds: BindingValue
  onBinds: (patch: Partial<BindingValue>) => void
  categories: Category[]
  models: ProductModelRow[]
  vendors: VendorRow[]
  /** Said only on an existing group, where the ticks are an act, not a state. */
  bindNote?: string
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>{tMeta.fieldGroups.name}</FieldLabel>
        <Input id={`${idPrefix}-name`} value={name} onChange={(e) => onName(e.target.value)} />
      </Field>
      <MemberPicker
        idPrefix={`${idPrefix}-member`}
        fields={fields}
        value={members}
        onChange={onMembers}
      />
      <BindingPicker
        idPrefix={idPrefix}
        value={binds}
        onChange={onBinds}
        categories={categories}
        models={models}
        vendors={vendors}
        modeHint={tMeta.fieldGroups.bindHint}
      />
      {/* A bound group leaves no trace, so there is nothing to read back and
          nothing an empty box could mean "not bound here". Visible, not behind
          a question mark: it is the state of the thing in front of them. */}
      {bindNote && <FieldDescription>{bindNote}</FieldDescription>}
    </FieldGroup>
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
  // A context menu closes as it fires, so what it starts is parked here and
  // rendered outside the table.
  const [editing, setEditing] = useState<FieldGroupRow | null>(null)
  const [editBinds, setEditBinds] = useState<BindingValue>(NO_BINDING)
  const [editError, setEditError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [members, setMembers] = useState<string[]>([])
  // The same value a field's form carries, because a group binds the same way.
  const [binds, setBinds] = useState<BindingValue>(NO_BINDING)
  const fields = useFieldLibrary()
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  const modelList = Array.isArray(models.data) ? models.data : []
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
  })
  const vendorList = Array.isArray(vendors.data) ? vendors.data : []
  const labelOf = (id: string) => fields.find((f) => f.id === id)?.label ?? id

  const invalidate = () => {
    setNotice(null)
    queryClient.invalidateQueries({ queryKey: ["field-groups"] })
    // The field list shows which groups each field is in.
    queryClient.invalidateQueries({ queryKey: ["fields"] })
  }
  const fail = (e: unknown) => setNotice(e instanceof ApiError ? e.message : t.common.error)

  const closeEditor = () => {
    setEditing(null)
    setEditBinds(NO_BINDING)
    setEditError(null)
  }

  // Two acts, in the order that keeps each one whole: the group's own
  // definition, then the bindings the ticks asked for -- one request over every
  // (member, target) pair, so a refusal there writes nothing at all.
  const save = useMutation({
    mutationFn: async (g: FieldGroupRow) => {
      await api.patch(`/field-groups/${g.id}`, { name: g.name, field_ids: g.field_ids })
      if (targetsOf(editBinds).length === 0) return
      await api.post(`/field-groups/${g.id}/bindings`, bindingBody(editBinds))
    },
    onSuccess: () => {
      invalidate()
      closeEditor()
    },
    onError: (e) => setEditError(e instanceof ApiError ? e.message : t.common.error),
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
        toolbarActions={<MetadataTabs current="groups" />}
        createLabel={tMeta.fieldGroups.create}
        createDeniedReason={deniedReason("schema.manage")}
        createDisabled={name === ""}
        onCreated={() => {
          setName("")
          setMembers([])
          setBinds(NO_BINDING)
        }}
        create={() =>
          // Bound in the same transaction: a refused binding leaves no group
          // behind, the same bargain creating a field makes.
          api.post("/field-groups", { name, field_ids: members, ...bindingBody(binds) })
        }
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
          // The same dialog: a group has one form, and binding is part of it.
          { label: tMeta.fieldGroups.bindAction, onSelect: (g) => setEditing(g) },
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
          <GroupForm
            idPrefix="g"
            name={name}
            onName={setName}
            members={members}
            onMembers={setMembers}
            fields={fields}
            binds={binds}
            onBinds={(patch) => setBinds((b) => ({ ...b, ...patch }))}
            categories={categories.data ?? []}
            models={modelList}
            vendors={vendorList}
          />
        }
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tMeta.fieldGroups.editTitle}</DialogTitle>
          </DialogHeader>
          {editing && (
            <GroupForm
              idPrefix="ge"
              name={editing.name}
              onName={(v) => setEditing({ ...editing, name: v })}
              members={editing.field_ids ?? []}
              onMembers={(ids) => setEditing({ ...editing, field_ids: ids })}
              fields={fields}
              binds={editBinds}
              onBinds={(patch) => setEditBinds((b) => ({ ...b, ...patch }))}
              categories={categories.data ?? []}
              models={modelList}
              vendors={vendorList}
              bindNote={tMeta.fieldGroups.bindFromEditor}
            />
          )}
          {/* A refusal belongs here: the page behind is aria-hidden and covered. */}
          {editError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
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
