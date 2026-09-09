-- +goose Up
-- One audit permission becomes two, and nobody loses what they had.
--
-- `audit.read` used to mean both "who renamed a field" and "where devices
-- went". Those answer different questions to different people: the first is
-- administrative, the second is the ledger's own subject matter and is useful
-- to anyone who keeps stock. Splitting them lets the movement half be ordinary
-- without making the operations half so.
--
-- The backfill grants BOTH to anyone who held the old one. The other reading --
-- give them only the operations log and let administrators tick the new box --
-- silently takes away an ability people already had, and does it at startup,
-- where nobody is watching. The first sign would be a colleague saying weeks
-- later that a page they used to open is gone, by which time the data has moved.
--
-- The `NOT EXISTS` half makes this repeatable. Migrations run more than once in
-- practice: a failed startup, a retry, a container rebuilt against the same
-- file. Twice must equal once, or a role ends up holding the same permission
-- twice and every reader has to decide what that means.
--
-- Administrators are not touched and must not be. `is_admin` is a flag, not a
-- list of ticks -- it means "everything, including what gets added later", so
-- the new permission reaches them by already being in `authz.All`. A migration
-- that wrote to their empty list would be evidence the flag had stopped
-- meaning that.
-- +goose StatementBegin
UPDATE roles
   SET permissions = json_insert(permissions, '$[#]', 'transfer.audit')
 WHERE EXISTS (
         SELECT 1 FROM json_each(roles.permissions) WHERE value = 'audit.read'
       )
   AND NOT EXISTS (
         SELECT 1 FROM json_each(roles.permissions) WHERE value = 'transfer.audit'
       );
-- +goose StatementEnd

-- +goose Down
-- Down removes the new permission from every role that holds it, which is the
-- only honest inverse: after Up ran, a role holding both is indistinguishable
-- from one granted both by hand afterwards. Rolling back therefore returns to
-- "one audit permission", which is what the revision before this can express.
-- +goose StatementBegin
UPDATE roles
   SET permissions = (
         SELECT json_group_array(value)
           FROM json_each(roles.permissions)
          WHERE value <> 'transfer.audit'
       )
 WHERE EXISTS (
         SELECT 1 FROM json_each(roles.permissions) WHERE value = 'transfer.audit'
       );
-- +goose StatementEnd
