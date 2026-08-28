import { zh } from "@/i18n/zh"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>
          {field.label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </Label>
        {field.inherited_from && <Badge variant="secondary">{zh.common.inherited}</Badge>}
        {field.is_unique && <Badge variant="outline">{zh.common.unique}</Badge>}
      </div>

      <FieldControl id={id} field={field} value={value} describedBy={describedBy} onChange={onChange} />

      {field.type === "computed" && (
        <p className="text-xs text-muted-foreground">{zh.common.computedHint}</p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
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
        <select
          id={id}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={str}
          aria-describedby={describedBy}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">—</option>
          {(field.options.choices ?? []).map((c) => (
            <option key={c.value} value={c.value} disabled={isDeprecated(field.options, c.value)}>
              {c.label}
              {isDeprecated(field.options, c.value) ? zh.common.deprecatedSuffix : ""}
            </option>
          ))}
        </select>
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
