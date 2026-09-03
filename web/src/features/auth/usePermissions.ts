import { useAuth } from "@/features/auth/useAuth"
import { t } from "@/i18n"

/**
 * Every switch the server knows, as it names them.
 *
 * A copy of the server's list, and like the holder tree's `allowedParents` it
 * exists only so the interface can avoid offering what will be refused. The
 * server checks every request for itself; this side going stale makes a button
 * wrong, not a rule.
 */
export const PERMISSIONS = [
  "asset.create",
  "asset.update",
  "asset.delete",
  "transfer.create",
  "transfer.update",
  "print",
  "import",
  "export",
  "schema.manage",
  "model.manage",
  "status.manage",
  "holder.create",
  "holder.update",
  "holder.delete",
  "holder.default_stock",
  "user.manage",
  "audit.read",
  "role.manage",
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * What the signed-in account may do.
 *
 * An administrator comes back with every permission spelled out, so nothing
 * here has to special-case them -- one less place to get wrong.
 *
 * While /me is still in flight the answer is "nothing", which shows a page of
 * disabled buttons for a moment rather than one that lets somebody press
 * something that will be refused.
 */
export function usePermissions() {
  const { user } = useAuth()
  const held = new Set<string>(user?.permissions ?? [])
  const can = (p: Permission) => held.has(p)
  return {
    can,
    isAdmin: user?.is_admin ?? false,
    /**
     * The sentence a disabled control carries, or undefined when it is not
     * disabled at all. Undefined rather than "" so a caller can hand it
     * straight to `title` and to `disabled={reason !== undefined}`.
     */
    deniedReason: (p: Permission) => (can(p) ? undefined : t.perm.denied(t.perm.names[p] ?? p)),
  }
}
