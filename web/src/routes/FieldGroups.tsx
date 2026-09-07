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
import { modelLabel } from "@/lib/metaTypes"
import { NONE, fromNone, toNone } from "@/lib/select"
import { BindingPicker, type BindingValue } from "@/features/fields/BindingPicker"

/** A form that has not been asked to bind anything yet. */
const NO_BINDING: BindingValue = { bindMode: "category", bindTo: [], bindVendors: [] }
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** What a group can be bound to, and the collection each one lives under. */
type BindKind = "category" | "model" | "vendor"
const PATHS: Record<BindKind, string> = {
  category: "/categories",
  model: "/models",
  vendor: "/vendors",
}

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
  // A context menu closes as it fires, so what it starts is parked here and
  // rendered outside the table.
  const [binding, setBinding] = useState<FieldGroupRow | null>(null)
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
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
  })
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
          api.post("/field-groups", {
            name,
            field_ids: members,
            // Bound in the same transaction: a refused binding leaves no group
            // behind, the same bargain creating a field makes.
            category_ids: binds.bindMode === "category" ? binds.bindTo : [],
            model_ids: binds.bindMode === "device" ? binds.bindTo : [],
            vendor_ids: binds.bindMode === "device" ? binds.bindVendors : [],
          })
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
          { label: tMeta.fieldGroups.bindAction, onSelect: (g) => setBinding(g) },
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
            <BindingPicker
              idPrefix="g"
              value={binds}
              onChange={(patch) => setBinds((b) => ({ ...b, ...patch }))}
              categories={categories.data ?? []}
              models={Array.isArray(models.data) ? models.data : []}
              vendors={Array.isArray(vendors.data) ? vendors.data : []}
            />
          </FieldGroup>
        }
      />

      <BindGroupDialog group={binding} onOpenChange={(open) => !open && setBinding(null)} />

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

/**
 * Binds a whole group to one category, model or vendor.
 *
 * The group is the subject here, which is why this lives on the group's own
 * row rather than in the field editor: binding a group is an act on a target,
 * not a property of any one field. It was in the field form to begin with,
 * where nothing could reach it.
 *
 * The request is the ordinary binding endpoint with group_id in place of
 * field_id -- no separate route, so the exclusion rules and the key checks
 * have one place to be right. A refusal lands in this dialog, because the page
 * behind it is aria-hidden and covered.
 */
function BindGroupDialog({
  group,
  onOpenChange,
}: {
  group: FieldGroupRow | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<BindKind>("category")
  const [targetID, setTargetID] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
    enabled: group !== null,
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
    enabled: group !== null,
  })
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
    enabled: group !== null,
  })

  const targets: { id: string; name: string }[] =
    kind === "category"
      ? (categories.data ?? []).map((c) => ({ id: c.id, name: c.name }))
      : kind === "model"
        ? (Array.isArray(models.data) ? models.data : []).map((m) => ({
            id: m.id,
            name: modelLabel(m),
          }))
        : (Array.isArray(vendors.data) ? vendors.data : []).map((v) => ({
            id: v.id,
            name: v.name,
          }))

  const bind = useMutation({
    mutationFn: () => api.post(`${PATHS[kind]}/${targetID}/bindings`, { group_id: group!.id }),
    onSuccess: () => {
      setError(null)
      setDone(targets.find((t) => t.id === targetID)?.name ?? targetID)
      // Every field of the group just changed where it is bound.
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      queryClient.invalidateQueries({ queryKey: ["schema"] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <Dialog
      open={group !== null}
      onOpenChange={(open) => {
        if (!open) {
          setKind("category")
          setTargetID("")
          setError(null)
          setDone(null)
        }
        onOpenChange(open)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? tMeta.fieldGroups.bindTitle(group.name) : ""}</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <div className="flex items-center gap-1.5">
              <FieldLabel htmlFor="gb-kind">{tMeta.fieldGroups.bindTarget}</FieldLabel>
              <Hint>{tMeta.fieldGroups.bindHint}</Hint>
            </div>
            <ToggleGroup
              id="gb-kind"
              type="single"
              variant="outline"
              className="justify-start"
              value={kind}
              onValueChange={(v) => {
                if (v === "category" || v === "model" || v === "vendor") {
                  setKind(v)
                  // The old pick belongs to the old kind, and sending it would
                  // aim the request at whatever happens to share its id.
                  setTargetID("")
                  setDone(null)
                }
              }}
            >
              <ToggleGroupItem value="category">{tMeta.fieldGroups.bindToCategory}</ToggleGroupItem>
              <ToggleGroupItem value="model">{tMeta.fieldGroups.bindToModel}</ToggleGroupItem>
              <ToggleGroupItem value="vendor">{tMeta.fieldGroups.bindToVendor}</ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel htmlFor="gb-target">{tMeta.fieldGroups.bindPick}</FieldLabel>
            <Select
              value={toNone(targetID)}
              onValueChange={(v) => {
                setTargetID(fromNone(v))
                setDone(null)
              }}
            >
              <SelectTrigger id="gb-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{tMeta.fieldGroups.bindPick}</SelectItem>
                  {targets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {targets.length === 0 && (
              <FieldDescription>{tMeta.fieldGroups.bindNoTarget}</FieldDescription>
            )}
          </Field>

          {/* A refusal names the member that is stuck and where. It belongs
              here rather than on the page: the page is covered. */}
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {done && group && (
            <Alert>
              <AlertCircleIcon />
              <AlertDescription>{tMeta.fieldGroups.bindDone(group.name, done)}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button disabled={targetID === "" || bind.isPending} onClick={() => bind.mutate()}>
            {tMeta.fieldGroups.bindConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
