export type { FieldType } from "./types"
import type { FieldOptions, FieldType } from "./types"

export interface FieldDefinitionRow {
  id: string
  key: string
  label: string
  type: FieldType
  options: FieldOptions
  is_unique: boolean
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
