export type { FieldType } from "./types"
import type { FieldOptions, FieldType } from "./types"

export interface FieldDefinitionRow {
  id: string
  key: string
  label: string
  type: FieldType
  options: FieldOptions
  is_unique: boolean
  /** The categories this field is bound to; empty until it is bound to one. */
  category_ids?: string[]
  /** The models it is bound to instead -- the two are exclusive (015). */
  model_ids?: string[]
  /** Which of the two it is, or "unbound" while it is on nothing yet. */
  binding_mode?: "category" | "model" | "unbound"
  /**
   * Whether every binding this field has asks for a value (018). It is the
   * field's own flag, not the binding's: "required in some of them" was a
   * state nobody could hold in their head and no cell could report.
   */
  required?: boolean
}

export interface ProductModelRow {
  id: string
  /** Every category whose entry form offers this model; may be empty. */
  category_ids: string[]
  name: string
  /** Never null: it takes part in the duplicate-name check. */
  vendor: string
  attr_defaults: Record<string, unknown>
  archived_at?: string | null
}

// Static keys carry what someone typed or imported; an expression key carries
// what the system worked out from them. One enum in the database, two groups
// here, because that is the distinction a person is actually choosing between.
// They live here rather than in a page because both field dialogs read them.
export const STATIC_FIELD_TYPES: FieldType[] = [
  "text", "number", "boolean", "date", "mac", "ip", "url",
]
export const EXPRESSION_FIELD_TYPES: FieldType[] = ["computed"]
