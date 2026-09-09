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
  /**
   * The two owners by name, resolved by the server from the same user list the
   * holder and the actor are named from.
   *
   * The ids stay because they are what the record holds; these are for the
   * reader. Either may be absent -- an account that has since been deleted
   * leaves its id behind and no name to print.
   */
  from_owner?: User | null
  to_owner?: User | null
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
  /**
   * How many devices moved in this one action.
   *
   * Counted by the server over the whole batch. The client cannot do it: the
   * overview folds a batch into one row and the movement log pages through it,
   * so counting the rows in hand would label the same shipment "20" on one
   * screen and "5" on the other.
   */
  batch_size?: number
  edited_at: string | null
  edited_by: string | null
  /** Who corrected the record, named by the server like every other person. */
  editor?: User | null
}

export interface TransferResult {
  batch_id: string | null
  transfers: Transfer[]
}
