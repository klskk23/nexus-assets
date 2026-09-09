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
export const NO_BINDING: BindingValue = { bindMode: "category", bindTo: [], bindVendors: [] }

/** The three lists, the way both the create and the bind request want them. */
export function bindingBody(b: BindingValue) {
  return {
    category_ids: b.bindMode === "category" ? b.bindTo : [],
    model_ids: b.bindMode === "device" ? b.bindTo : [],
    vendor_ids: b.bindMode === "device" ? b.bindVendors : [],
  }
}

/** Everything ticked, for the "was anything asked for" check. */
export function targetsOf(b: BindingValue) {
  const body = bindingBody(b)
  return [...body.category_ids, ...body.model_ids, ...body.vendor_ids]
}
import { t, tMeta } from "@/i18n"
import { Hint } from "@/features/common/Hint"
import type { ListPage } from "@/features/metadata/CrudPage"
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
export function useFieldLibrary() {
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
export function GroupForm({
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
 * One group's name, members and a chance to bind it -- in a dialog.
 *
 * Lifted out of the page that used to be `/fields/groups`, unchanged. 025
 * merged that page into the fields rail, and the form had no reason to change
 * with it: what a group is did not move, only where you reach it from.
 *
 * Self-contained rather than fed from above: it needs the field library and
 * the three kinds of binding target, and a caller passing four lists it does
 * not otherwise care about is four chances to pass the wrong one.
 */
export function GroupEditor({
  group,
  onClose,
}: {
  group: FieldGroupRow
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<FieldGroupRow>(group)
  const [binds, setBinds] = useState<BindingValue>(NO_BINDING)
  const [error, setError] = useState<string | null>(null)

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

  // Two acts, in the order that keeps each one whole: the group's own
  // definition, then the bindings the ticks asked for -- one request over every
  // (member, target) pair, so a refusal there writes nothing at all.
  const save = useMutation({
    mutationFn: async () => {
      await api.patch(`/field-groups/${draft.id}`, {
        name: draft.name,
        field_ids: draft.field_ids,
      })
      if (targetsOf(binds).length === 0) return
      await api.post(`/field-groups/${draft.id}/bindings`, bindingBody(binds))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-groups"] })
      // The field list carries which groups each field is in.
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tMeta.fieldGroups.editTitle}</DialogTitle>
        </DialogHeader>
        <GroupForm
          idPrefix="ge"
          name={draft.name}
          onName={(v) => setDraft({ ...draft, name: v })}
          members={draft.field_ids ?? []}
          onMembers={(ids) => setDraft({ ...draft, field_ids: ids })}
          fields={fields}
          binds={binds}
          onBinds={(patch) => setBinds((b) => ({ ...b, ...patch }))}
          categories={categories.data ?? []}
          models={Array.isArray(models.data) ? models.data : []}
          vendors={Array.isArray(vendors.data) ? vendors.data : []}
          bindNote={tMeta.fieldGroups.bindFromEditor}
        />
        {/* A refusal belongs here: the page behind is aria-hidden and covered. */}
        {error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            disabled={draft.name === "" || save.isPending}
            onClick={() => save.mutate()}
          >
            {tMeta.fieldGroups.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
