/**
 * A status key. Not a union any more: an administrator can add statuses, so
 * the set is data. The five built-ins are still spelled out below for the
 * places that legitimately mean one specific status -- the entry default, and
 * the check-out/check-in pair.
 */
export type AssetStatus = string

export const BUILTIN_STATUSES = ["in_stock", "in_use", "in_repair", "lost", "retired"] as const

/** One configurable status, as the server stores it. */
export interface Status {
  key: string
  label: string
  color: string
  sort: number
  builtin: boolean
  requires_location: boolean
  counts_as_available: boolean
  terminal: boolean
}

/** What deleting a status would cost. */
export interface StatusUsage {
  assets: number
  history: number
}

/**
 * The palette slots a status may take.
 *
 * The same list exists on the server, which validates against it, and in
 * index.css, which decides what each slot looks like in either theme. Three
 * copies is one more than ideal, but a colour has to be validated where it is
 * written and painted where it is shown; what matters is that the names match.
 */
export const PALETTE = ["slate", "green", "blue", "amber", "red", "violet", "teal", "rose"]

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
