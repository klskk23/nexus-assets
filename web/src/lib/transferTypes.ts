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
