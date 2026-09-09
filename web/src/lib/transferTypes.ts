import type { AssetStatus, Holder, User } from "./types"

export type TransferKind =
  | "create"
  | "checkout"
  | "checkin"
  | "transfer"
  | "reassign"
  | "status_change"

export interface Transfer {
  id: string
  asset_id: string
  batch_id: string | null
  kind: TransferKind
  from_status: AssetStatus | null
  from_holder: Holder | null
  from_owner_id: string | null
  to_status: AssetStatus
  to_holder: Holder
  to_owner_id: string
  note?: string
  due_at: string | null
  actor?: User
  /**
   * The asset's readable number, resolved by the server at read time.
   *
   * Not stored on the transfer: the number is whichever attribute the asset's
   * category nominates, so it is a join away rather than a column. Without it
   * a movement can only name its asset as a uuid, which is exactly what made
   * the overview's recent movements unreadable.
   */
  asset_display_name?: string
  created_at: string
  edited_at: string | null
  edited_by: string | null
  /** Filled in by the client from the user list, for display only. */
  edited_by_name?: string
}

export interface TransferResult {
  batch_id: string | null
  transfers: Transfer[]
}
