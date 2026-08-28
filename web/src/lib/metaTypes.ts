export type { FieldType } from "./types"
import type { FieldOptions, FieldType } from "./types"

export interface FieldDefinitionRow {
  id: string
  key: string
  label: string
  type: FieldType
  options: FieldOptions
  is_unique: boolean
  archived_at?: string | null
}

export interface ProductModelRow {
  id: string
  category_id: string
  name: string
  vendor?: string
  attr_defaults: Record<string, unknown>
}
