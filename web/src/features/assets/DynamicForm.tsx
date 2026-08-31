import { t } from "@/i18n"
import { fromNone, toNone } from "@/lib/select"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import type { BoundField, FieldOptions } from "@/lib/types"
import type { FieldErrors } from "@/lib/api"

interface Props {
  fields: BoundField[]
  values: Record<string, unknown>
  errors?: FieldErrors
  onChange: (key: string, value: unknown) => void
}

/**
 * Renders the entry form from the category schema.
 *
 * Nothing here knows which fields exist: the shape comes entirely from
 * /categories/:id/schema, which is what lets an administrator add an
 * information item without a frontend change.
 */
export function DynamicForm({ fields, values, errors, onChange }: Props) {
  return (
    <div className="grid gap-5">
      {fields.map((f) => (
        <FieldRow key={f.key} field={f} value={values[f.key]} error={errors?.[f.key]} onChange={onChange} />
      ))}
    </div>
  )
}

function FieldRow({
  field,
  value,
  error,
  onChange,
}: {
  field: BoundField
  value: unknown
  error?: string
  onChange: (key: string, value: unknown) => void
}) {
  const id = `field-${field.key}`
  const describedBy = error ? `${id}-error` : undefined

  return (
    // data-invalid marks the whole field; the control carries aria-invalid, so
    // the styling and the accessibility signal cannot drift apart.
    <Field data-invalid={error ? true : undefined}>
      <div className="flex items-center gap-2">
        <FieldLabel htmlFor={id}>
          {field.label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </FieldLabel>
        {field.inherited_from && <Badge variant="secondary">{t.common.inherited}</Badge>}
        {field.is_unique && <Badge variant="outline">{t.common.unique}</Badge>}
      </div>

      <FieldControl id={id} field={field} value={value} describedBy={describedBy} onChange={onChange} />

      {field.type === "computed" && <FieldDescription>{t.common.computedHint}</FieldDescription>}
      {error && (
        <FieldError id={`${id}-error`} role="alert">
          {error}
        </FieldError>
      )}
    </Field>
  )
}

function FieldControl({
  id,
  field,
  value,
  describedBy,
  onChange,
}: {
  id: string
  field: BoundField
  value: unknown
  describedBy?: string
  onChange: (key: string, value: unknown) => void
}) {
  const str = value === undefined || value === null ? "" : String(value)

  switch (field.type) {
    case "computed":
      return <Input id={id} value={str} readOnly disabled aria-describedby={describedBy} />

    case "boolean":
      return (
        <Checkbox
          id={id}
          checked={str === "true"}
          aria-describedby={describedBy}
          onCheckedChange={(v) => onChange(field.key, v === true ? "true" : "false")}
        />
      )

    case "enum":
      return (
        <Select value={toNone(str)} onValueChange={(v) => onChange(field.key, fromNone(v))}>
          <SelectTrigger id={id} aria-describedby={describedBy}>
            <SelectValue placeholder={t.common.select} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(field.options.choices ?? []).map((c) => (
                <SelectItem
                  key={c.value}
                  value={c.value}
                  // A retired choice stays visible on the assets that already
                  // carry it, but cannot be picked anew.
                  disabled={isDeprecated(field.options, c.value)}
                >
                  {c.label}
                  {isDeprecated(field.options, c.value) ? t.common.deprecatedSuffix : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )

    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={str}
          aria-describedby={describedBy}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )

    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={str}
          aria-describedby={describedBy}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )

    default:
      return (
        <Input
          id={id}
          value={str}
          placeholder={field.options.regex_hint}
          aria-describedby={describedBy}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )
  }
}

function isDeprecated(options: FieldOptions, value: string) {
  return (options.deprecated ?? []).includes(value)
}

/** Small controlled-state helper so pages do not each reimplement it. */
export function useAttrState(initial: Record<string, unknown> = {}) {
  const [values, setValues] = useState<Record<string, unknown>>(initial)
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }))
  return { values, set, setValues }
}
