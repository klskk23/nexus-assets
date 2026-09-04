import { AlertCircleIcon } from "lucide-react"

import { tConfig, tMeta } from "@/i18n"
import type { Category, FieldOptions, FieldType } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { EXPRESSION_FIELD_TYPES, STATIC_FIELD_TYPES } from "@/lib/metaTypes"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ExpressionHelp } from "@/features/fields/ExpressionHelp"
import { Hint } from "@/features/common/Hint"

export interface FieldFormValue {
  key: string
  label: string
  type: FieldType
  isUnique: boolean
  required: boolean
  options: FieldOptions
  /** Category or model, whichever `bindMode` says. */
  bindTo: string[]
  bindMode: "category" | "model"
}

interface Props {
  /**
   * Creating decides everything; editing may only change what is safe to
   * change afterwards.
   *
   * Key and type are frozen because values already stored under them were
   * written to that shape. Uniqueness is frozen for a harder reason: turning
   * it on would have to prove the stored values do not collide and backfill
   * asset_unique_values for every asset holding one, which is a job of its
   * own rather than a checkbox.
   */
  mode: "create" | "edit"
  value: FieldFormValue
  onChange: (patch: Partial<FieldFormValue>) => void
  categories: Category[]
  models: ProductModelRow[]
  /**
   * Whether the binding mode may still be chosen. Once a field is bound one
   * way, switching would have to drop what is there -- a decision of its own
   * (015, decision 96).
   */
  bindModeFrozen?: boolean
  /**
   * How many devices a required field would eventually ask. Required is
   * checked when an asset is written, not when the field is bound, so the
   * devices already recorded keep their gap until somebody edits one -- worth
   * saying before the box is ticked (decision 70).
   */
  impact?: number
  /** Prefix for control ids, so two of these can never collide on a page. */
  idPrefix: string
}

/**
 * Every input a field has, in one place, for both the create and the edit
 * dialog.
 *
 * They were two forms that had drifted: create could tick several categories
 * at once, edit could only add them one at a time; create could not bind to
 * models at all until it grew its own copy of the switch; number configuration
 * existed only in edit. One component, and the drift has nowhere to happen.
 */
export function FieldForm({
  mode,
  value,
  onChange,
  categories,
  models,
  bindModeFrozen,
  impact,
  idPrefix: p,
}: Props) {
  const setOption = (patch: Partial<FieldOptions>) =>
    onChange({ options: { ...value.options, ...patch } })
  const creating = mode === "create"

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
    <FieldGroup className="sm:grid sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${p}-key`}>{tMeta.fields.key}</FieldLabel>
        <Input
          id={`${p}-key`}
          className="font-mono"
          value={value.key}
          disabled={!creating}
          placeholder={creating ? tMeta.fields.keyPlaceholder : undefined}
          onChange={(e) => onChange({ key: e.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${p}-label`}>{tMeta.fields.label}</FieldLabel>
        <Input
          id={`${p}-label`}
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>

      <Field>
        <div className="flex items-center gap-1.5">
          <FieldLabel htmlFor={`${p}-type`}>{tMeta.fields.type}</FieldLabel>
          {!creating && <Hint>{tMeta.fields.typeFixed}</Hint>}
        </div>
        <Select
          value={value.type}
          disabled={!creating}
          onValueChange={(v) => onChange({ type: v as FieldType })}
        >
          <SelectTrigger id={`${p}-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* The two kinds are one enum in the database; the split lives
                here, where it is the difference a person actually cares
                about: is this value typed in, or worked out? */}
            <SelectGroup>
              <SelectLabel>{tConfig.field.staticGroup}</SelectLabel>
              {STATIC_FIELD_TYPES.map((ft) => (
                <SelectItem key={ft} value={ft}>
                  {tMeta.fieldTypes[ft] ?? ft}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{tConfig.field.expressionGroup}</SelectLabel>
              {EXPRESSION_FIELD_TYPES.map((ft) => (
                <SelectItem key={ft} value={ft}>
                  {tMeta.fieldTypes[ft] ?? ft}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {/* The two flags a field carries, side by side because they are read
          together: does this value have to be there, and does it have to be
          unlike every other. Required is the field's own since 018 -- it used
          to be set per binding, which made "is this field required" a question
          with more than one answer. */}
      <Field className="pt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${p}-unique`}
                checked={value.isUnique}
                disabled={!creating}
                onCheckedChange={(v) => onChange({ isUnique: v === true })}
              />
              <FieldLabel htmlFor={`${p}-unique`}>{tMeta.fields.unique}</FieldLabel>
              <Hint>{creating ? tMeta.fields.uniqueScopeHint : tMeta.fields.uniqueFixed}</Hint>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${p}-required`}
                checked={value.required}
                onCheckedChange={(v) => onChange({ required: v === true })}
              />
              <FieldLabel htmlFor={`${p}-required`}>{tMeta.categories.required}</FieldLabel>
              <Hint>{tMeta.fields.requiredScopeHint}</Hint>
            </div>
          </div>
        </div>
        {value.required && (impact ?? 0) > 0 && (
          <Alert>
            <AlertCircleIcon />
            <AlertDescription>{tMeta.categories.requiredWarning(impact ?? 0)}</AlertDescription>
          </Alert>
        )}
      </Field>

      {value.type === "text" && (
        <>
          <Field>
            <FieldLabel htmlFor={`${p}-regex`}>{tConfig.field.regex}</FieldLabel>
            <Input
              id={`${p}-regex`}
              className="font-mono"
              placeholder="^[A-Z]{2}-\d{4}$"
              value={value.options.regex ?? ""}
              onChange={(e) => setOption({ regex: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${p}-regex-hint`}>{tConfig.field.regexHint}</FieldLabel>
            <Input
              id={`${p}-regex-hint`}
              value={value.options.regex_hint ?? ""}
              onChange={(e) => setOption({ regex_hint: e.target.value })}
            />
          </Field>
        </>
      )}

      {value.type === "number" && (
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor={`${p}-min`}>{tConfig.field.min}</FieldLabel>
            <Input
              id={`${p}-min`}
              type="number"
              value={value.options.min ?? ""}
              onChange={(e) =>
                setOption({ min: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${p}-max`}>{tConfig.field.max}</FieldLabel>
            <Input
              id={`${p}-max`}
              type="number"
              value={value.options.max ?? ""}
              onChange={(e) =>
                setOption({ max: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${p}-unit`}>{tConfig.field.unit}</FieldLabel>
            <Input
              id={`${p}-unit`}
              value={value.options.unit ?? ""}
              onChange={(e) => setOption({ unit: e.target.value })}
            />
          </Field>
        </div>
      )}

      {value.type === "computed" && (
        <Field className="sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <FieldLabel htmlFor={`${p}-template`}>{tConfig.field.template}</FieldLabel>
              <Hint>
                {tConfig.field.templateHint} {tConfig.field.depsHint}
              </Hint>
            </div>
            <ExpressionHelp />
          </div>
          <Input
            id={`${p}-template`}
            className="font-mono"
            placeholder="hex2dec(attrs.mac)"
            value={value.options.template ?? ""}
            onChange={(e) => setOption({ template: e.target.value })}
          />

        </Field>
      )}

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
            if (v === "category" || v === "model") onChange({ bindMode: v, bindTo: [] })
          }}
        >
          <ToggleGroupItem value="category" aria-label={tMeta.fields.bindByCategory}>
            {tMeta.fields.bindByCategory}
          </ToggleGroupItem>
          <ToggleGroupItem value="model" aria-label={tMeta.fields.bindByModel}>
            {tMeta.fields.bindByModel}
          </ToggleGroupItem>
        </ToggleGroup>
        {/* Why the switch is dead is the state of the thing in front of
            them, not a hint they can go looking for. */}
        {bindModeFrozen && <FieldDescription>{tMeta.fields.bindingModeFrozen}</FieldDescription>}
      </Field>

      <Field className="sm:col-span-2">
        <div className="flex items-center gap-1.5">
          <FieldLabel>
            {value.bindMode === "model"
              ? tMeta.fields.bindOnCreateModel
              : tMeta.fields.bindOnCreate}
          </FieldLabel>
          <Hint>
            {value.bindMode === "model"
              ? tMeta.fields.bindOnCreateModelHint
              : tMeta.fields.bindOnCreateHint}
          </Hint>
        </div>
        <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto">
          {(value.bindMode === "model"
            ? models.map((m) => ({ id: m.id, name: m.vendor ? `${m.vendor} ${m.name}` : m.name }))
            : categories.map((c) => ({ id: c.id, name: c.name }))
          ).map((o) => {
            const owner = chainOwner(o.id)
            const self = categories.find((c) => c.id === o.id)
            const inherits = owner !== null && (self?.path ?? "").startsWith(owner.path)
            const why = owner
              ? inherits
                ? tMeta.fields.boundOnAncestor(owner.name)
                : tMeta.fields.boundOnDescendant(owner.name)
              : undefined
            return (
              <Field key={o.id} orientation="horizontal" data-disabled={owner ? true : undefined}>
                <Checkbox
                  id={`${p}-bind-${o.id}`}
                  checked={value.bindTo.includes(o.id)}
                  disabled={owner !== null}
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
    </FieldGroup>
  )
}
