import { AlertCircleIcon } from "lucide-react"

import { tConfig, tMeta } from "@/i18n"
import type { Category, FieldOptions, FieldType } from "@/lib/types"
import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { EXPRESSION_FIELD_TYPES, STATIC_FIELD_TYPES } from "@/lib/metaTypes"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
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
import { BindingPicker, type BindingValue } from "@/features/fields/BindingPicker"

export interface FieldFormValue extends BindingValue {
  key: string
  label: string
  type: FieldType
  isUnique: boolean
  required: boolean
  options: FieldOptions
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
  vendors: VendorRow[]
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
  vendors,
  bindModeFrozen,
  impact,
  idPrefix: p,
}: Props) {
  const setOption = (patch: Partial<FieldOptions>) =>
    onChange({ options: { ...value.options, ...patch } })
  const creating = mode === "create"

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

      <div className="sm:col-span-2">
        <BindingPicker
          idPrefix={p}
          value={value}
          onChange={onChange}
          categories={categories}
          models={models}
          vendors={vendors}
          bindModeFrozen={bindModeFrozen}
        />
      </div>
    </FieldGroup>
  )
}
