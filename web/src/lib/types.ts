export type AssetStatus = "in_stock" | "in_use" | "in_repair" | "lost" | "retired"

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "reference"
  | "mac"
  | "ip"
  | "url"
  | "computed"

export interface EnumChoice {
  value: string
  label: string
}

export interface FieldOptions {
  regex?: string
  regex_hint?: string
  min?: number
  max?: number
  unit?: string
  choices?: EnumChoice[]
  deprecated?: string[]
  target?: "user" | "entity"
  entity_types?: string[]
  template?: string
}

export interface BoundField {
  id: string
  key: string
  label: string
  type: FieldType
  options: FieldOptions
  is_unique: boolean
  required: boolean
  sort: number
  inherited_from?: string
}

export interface Category {
  id: string
  code: string
  name: string
  parent_id: string | null
  path: string
  /** Key of the bound field people read aloud; empty falls back to the short UUID. */
  display_key: string
}

export interface CategorySchema {
  category: Category
  fields: BoundField[]
}

export interface User {
  id: string
  email: string
  name: string
  auth_type: "oidc" | "local"
  status: "active" | "disabled"
}

export interface HolderEntity {
  id: string
  type: "company" | "location" | "department"
  name: string
  parent_id: string | null
  is_default_stock: boolean
}

export interface Holder {
  type: "user" | "entity"
  id: string
  name?: string
  entity_type?: string
}

export interface Asset {
  id: string
  /** Derived by the server from the category's display key, or the short UUID. */
  display_name: string
  category_id: string
  model_id: string | null
  status: AssetStatus
  owner?: User
  holder: Holder
  attrs: Record<string, unknown>
  archived_attrs?: Record<string, unknown>
  version: number
  created_at: string
  updated_at: string
}

export interface AssetPage {
  items: Asset[]
  total: number
  offset: number
  limit: number
  exact_match_id?: string
}
