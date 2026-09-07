import { tMeta } from "@/i18n"
import type { Category } from "@/lib/types"
import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { modelLabel } from "@/lib/metaTypes"
import { Checkbox } from "@/components/ui/checkbox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Hint } from "@/features/common/Hint"

/** Where something is bound: one side or the other, and which of it. */
export interface BindingValue {
  bindMode: "category" | "device"
  /** Categories, or models -- whichever side `bindMode` names. */
  bindTo: string[]
  /** Vendors, in device mode. Models and vendors are one side (016). */
  bindVendors: string[]
}

interface Props {
  value: BindingValue
  onChange: (patch: Partial<BindingValue>) => void
  categories: Category[]
  models: ProductModelRow[]
  vendors: VendorRow[]
  /**
   * Whether the side may still be chosen. Once something is bound one way,
   * switching would have to drop what is there (015, decision 96).
   */
  bindModeFrozen?: boolean
  /** Prefix for control ids, so two of these can never collide on a page. */
  idPrefix: string
}

/**
 * The binding half of a form: which side, and which of that side's things.
 *
 * Shared by the field form and the field-group form because a group binds
 * exactly the way a field does -- it is a shorthand for binding its members,
 * and binding a member to five categories was always allowed. They were two
 * shapes for one question, and the group's could only ever name one target.
 */
export function BindingPicker({
  value,
  onChange,
  categories,
  models,
  vendors,
  bindModeFrozen,
  idPrefix: p,
}: Props) {
  // A child inherits what its parent binds, so the same field may appear only
  // once on a chain -- and the server refuses the second one. Ticking a
  // category whose parent already has the field used to produce a refusal that
  // was correct and baffling: the box looked available, and the sentence
  // talked about a category the person had not touched. The box is disabled
  // instead, and says which relative already has it.
  //
  // Only what can be proven from here: the server also refuses a *different*
  // field carrying the same key on that chain, which this cannot see. It stays
  // the gate; this only stops offering what is certainly not on offer.
  const chainOwner = (id: string) => {
    if (value.bindMode !== "category") return null
    const self = categories.find((c) => c.id === id)
    if (!self) return null
    return (
      categories.find(
        (c) =>
          c.id !== id &&
          value.bindTo.includes(c.id) &&
          (self.path.startsWith(c.path) || c.path.startsWith(self.path)),
      ) ?? null
    )
  }

  return (
    <>
  {/* The two modes are exclusive, so this is one list with a switch above
      it rather than two lists somebody could tick both of. */}
  <Field className="sm:col-span-2">
    <div className="flex items-center gap-1.5">
      <FieldLabel htmlFor={`${p}-bind-mode`}>{tMeta.fields.bindingMode}</FieldLabel>
      <Hint>{tMeta.fields.bindingModeHint}</Hint>
    </div>
    <ToggleGroup
      id={`${p}-bind-mode`}
      type="single"
      variant="outline"
      className="justify-start"
      value={value.bindMode}
      disabled={bindModeFrozen}
      onValueChange={(v) => {
        if (v === "category" || v === "device") {
          onChange({ bindMode: v, bindTo: [], bindVendors: [] })
        }
      }}
    >
      <ToggleGroupItem value="category" aria-label={tMeta.fields.bindByCategory}>
        {tMeta.fields.bindByCategory}
      </ToggleGroupItem>
      <ToggleGroupItem value="device" aria-label={tMeta.fields.bindByDevice}>
        {tMeta.fields.bindByDevice}
      </ToggleGroupItem>
    </ToggleGroup>
  {/* Why the switch is dead is the state of the thing in front of
        them, not a hint they can go looking for. */}
    {bindModeFrozen && <FieldDescription>{tMeta.fields.bindingModeFrozen}</FieldDescription>}
  </Field>

  {value.bindMode === "device" && (
    <Field className="sm:col-span-2">
      <div className="flex items-center gap-1.5">
        <FieldLabel>{tMeta.fields.bindOnCreateVendor}</FieldLabel>
        <Hint>{tMeta.fields.bindOnCreateVendorHint}</Hint>
      </div>
      <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
        {vendors.map((v) => (
          <Field key={v.id} orientation="horizontal">
            <Checkbox
              id={`${p}-vendor-${v.id}`}
              checked={value.bindVendors.includes(v.id)}
              onCheckedChange={(c) =>
                onChange({
                  bindVendors:
                    c === true
                      ? [...value.bindVendors, v.id]
                      : value.bindVendors.filter((id) => id !== v.id),
                  // A model this vendor makes stops being a separate
                  // choice, so drop it rather than leave a tick nobody
                  // can see the effect of.
                  bindTo:
                    c === true
                      ? value.bindTo.filter(
                          (id) => models.find((m) => m.id === id)?.vendor_id !== v.id,
                        )
                      : value.bindTo,
                })
              }
            />
            <FieldLabel htmlFor={`${p}-vendor-${v.id}`} className="font-normal">
              {v.name}
            </FieldLabel>
          </Field>
        ))}
      </div>
    </Field>
  )}

  <Field className="sm:col-span-2">
    <div className="flex items-center gap-1.5">
      <FieldLabel>
        {value.bindMode === "device"
          ? tMeta.fields.bindOnCreateModel
          : tMeta.fields.bindOnCreate}
      </FieldLabel>
      <Hint>
        {value.bindMode === "device"
          ? tMeta.fields.bindOnCreateModelHint
          : tMeta.fields.bindOnCreateHint}
      </Hint>
    </div>
    <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto">
      {(value.bindMode === "device"
        ? models.map((m) => ({ id: m.id, name: modelLabel(m), vendorID: m.vendor_id }))
        : categories.map((c) => ({ id: c.id, name: c.name, vendorID: undefined }))
      ).map((o) => {
        const owner = chainOwner(o.id)
        const self = categories.find((c) => c.id === o.id)
        const inherits = owner !== null && (self?.path ?? "").startsWith(owner.path)
        // A model whose vendor is ticked already has the field. Same
        // treatment as a category whose parent has it: the box is dead and
        // says why, rather than accepting a tick that changes nothing.
        const provider =
          o.vendorID && value.bindVendors.includes(o.vendorID)
            ? (vendors.find((v) => v.id === o.vendorID)?.name ?? o.vendorID)
            : null
        const why = provider
          ? tMeta.fields.providedByVendor(provider)
          : owner
            ? inherits
              ? tMeta.fields.boundOnAncestor(owner.name)
              : tMeta.fields.boundOnDescendant(owner.name)
            : undefined
        const dead = provider !== null || owner !== null
        return (
          <Field key={o.id} orientation="horizontal" data-disabled={dead ? true : undefined}>
            <Checkbox
              id={`${p}-bind-${o.id}`}
              checked={value.bindTo.includes(o.id) || provider !== null}
              disabled={dead}
              title={why}
              onCheckedChange={(v) =>
                onChange({
                  bindTo:
                    v === true
                      ? [...value.bindTo, o.id]
                      : value.bindTo.filter((id) => id !== o.id),
                })
              }
            />
            <FieldLabel htmlFor={`${p}-bind-${o.id}`} className="font-normal" title={why}>
              {o.name}
            </FieldLabel>
          </Field>
        )
      })}
    </div>
  </Field>

    </>
  )
}
