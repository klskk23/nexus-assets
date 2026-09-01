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
  | "mac"
  | "ip"
  | "url"
  | "computed"

export interface FieldOptions {
  regex?: string
  regex_hint?: string
  min?: number
  max?: number
  unit?: string
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
  /** What this person chose for the interface; empty follows the system. */
  lang?: string
  theme?: string
}

export type EntityType = "company" | "location" | "department"

export interface HolderEntity {
  id: string
  type: EntityType
  name: string
  /** A department belongs to a company; a location may sit under either. */
  parent_id: string | null
  /** Whatever the operator needs to remember: a rack range, a contact. */
  note: string
  is_default_stock: boolean
}

/**
 * What each kind of holder may hang from. The server enforces the same table;
 * this copy exists so the form can offer only valid parents rather than let
 * you pick one and then refuse it.
 */
export const ALLOWED_PARENTS: Record<EntityType, EntityType[]> = {
  company: [],
  department: ["company"],
  location: ["company", "department"],
}

/** What deleting a holder would cost. */
export interface HolderUsage {
  /** Devices holding it or naming it in a reference field. Refuses. */
  assets: number
  /** Entities hanging from it. Refuses. */
  children: number
  /** Transfer events mentioning it. Warns only. */
  history: number
}

/** Kinds that cannot stand alone. */
export const PARENT_REQUIRED: Record<EntityType, boolean> = {
  company: false,
  department: true,
  location: false,
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
  /** Where it belongs when it is not out; check-in returns it here. */
  home_holder?: Holder
  home_owner?: User
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

/** One collision a recompute would cause on a unique key. */
export interface Conflict {
  key: string
  value: string
  assets: string[]
}

/** What a recompute did, or would do. */
export interface RecomputeReport {
  affected: number
  total: number
  conflicts: Conflict[] | null
  applied: boolean
  samples: { asset: string; key: string; from: string; to: string }[] | null
}
