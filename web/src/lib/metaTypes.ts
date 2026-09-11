export type { FieldType } from "./types"
import type { FieldOptions, FieldType } from "./types"

export interface FieldDefinitionRow {
  id: string
  key: string
  label: string
  type: FieldType
  options: FieldOptions
  is_unique: boolean
  /** Whether the asset search reaches this field's values. Unique implies it. */
  searchable?: boolean
  /** The categories this field is bound to; empty until it is bound to one. */
  category_ids?: string[]
  /**
   * The models it is bound to instead -- category and device are exclusive
   * (015, widened by 016). On this row it means "bound to these models", not
   * the reach set the schema endpoint returns: the binding column and the
   * editor have to show what somebody chose, not what it grew into.
   */
  model_ids?: string[]
  /** And the vendors, which is the other half of the same answer (016). */
  vendor_ids?: string[]
  /**
   * Which groups the field belongs to. A group is expanded at bind time and
   * leaves no trace, so this says nothing about where the field is bound --
   * it is what the group filter reads.
   */
  group_ids?: string[]
  /** Which side it is on, or "unbound" while it is on nothing yet. */
  binding_mode?: "category" | "device" | "unbound"
  /**
   * Whether every binding this field has asks for a value (018). It is the
   * field's own flag, not the binding's: "required in some of them" was a
   * state nobody could hold in their head and no cell could report.
   */
  required?: boolean
}

export interface ProductModelRow {
  id: string
  name: string
  /** The vendor it comes from, empty for a model that has none (016). */
  vendor_id?: string
  /** Its name, joined on read -- renaming a vendor reaches every model. */
  vendor_name?: string
  /**
   * A sentence about the model itself: discontinued, a revision to avoid,
   * which module it takes. Absent in a PATCH means "leave it alone"; an empty
   * string clears it.
   */
  note?: string
  attr_defaults: Record<string, unknown>
  archived_at?: string | null
}

/** A vendor, which models come from and fields can be bound to (016). */
export interface VendorRow {
  id: string
  name: string
  /** How many models come from it, so the delete guard can be shown early. */
  model_count?: number
}

/** A handful of fields somebody wants to bind together (016). */
export interface FieldGroupRow {
  id: string
  name: string
  field_ids: string[]
}

/** Reads a model the way every list shows it: vendor first when there is one. */
export function modelLabel(m: { name: string; vendor_name?: string }): string {
  return m.vendor_name ? `${m.vendor_name} ${m.name}` : m.name
}

// Static keys carry what someone typed or imported; an expression key carries
// what the system worked out from them. One enum in the database, two groups
// here, because that is the distinction a person is actually choosing between.
// They live here rather than in a page because both field dialogs read them.
export const STATIC_FIELD_TYPES: FieldType[] = [
  "text", "number", "boolean", "date", "mac", "ip", "url",
]
export const EXPRESSION_FIELD_TYPES: FieldType[] = ["computed"]
