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
   * The bindings that ask for a value, as a subset of whichever list above is
   * populated. Required is per binding -- a field can be required on one
   * category and optional on another -- so this is a list and not a flag.
   */
  required_in?: string[]
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
