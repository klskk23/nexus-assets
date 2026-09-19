import { WarningCircle } from "@phosphor-icons/react"
import { Hint } from "@/features/common/Hint"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Role } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { PERMISSIONS, usePermissions, type Permission } from "@/features/auth/usePermissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

interface Props {
  role: Role
  onClose: () => void
}

/**
 * Edits one role: its name, and which switches it carries.
 *
 * The administrator has no switches to show. It is not eighteen ticks that
 * happen to all be on -- it means every permission, including ones a later
 * version adds -- so showing boxes would invite somebody to clear one and
 * leave nobody able to change permissions again.
 */
export function RoleEditor({ role, onClose }: Props) {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [name, setName] = useState(role.name)
  const [chosen, setChosen] = useState<string[]>(role.permissions)
  const [banner, setBanner] = useState<string | null>(null)

  const denied = deniedReason("role.manage")

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/roles/${role.id}`, {
        name,
        // Absent for the administrator: the server refuses to edit them, and
        // sending an empty list would be asking for exactly that refusal.
        ...(role.is_admin ? {} : { permissions: chosen }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      // The account's own permissions may have just changed under it.
      queryClient.invalidateQueries({ queryKey: ["me"] })
      onClose()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  // Deleting lives here as well as on the row menu, the way it does for a
  // model, a vendor and a category (029): the dialog is where somebody is
  // looking at the thing. Refused while anybody is on the role, and the
  // button says so before the click.
  const remove = useMutation({
    mutationFn: () => api.del(`/roles/${role.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      onClose()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })
  const deleteBlocked = role.users > 0 ? tMeta.roles.deleteBlocked(role.users) : undefined

  const toggle = (p: string) =>
    setChosen((cur) => (cur.includes(p) ? cur.filter((k) => k !== p) : [...cur, p]))

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{tMeta.roles.editTitle(role.name)}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="role-edit-name">{tMeta.roles.name}</FieldLabel>
            <Input
              id="role-edit-name"
              value={name}
              disabled={denied !== undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          {role.is_admin ? (
            <p className="bg-well text-neutral-400 rounded-md p-[10px_12px] text-[13px]">
              {tMeta.roles.adminFixed}
            </p>
          ) : (
            <Field>
              <div className="flex items-center gap-1.5">
                <FieldLabel>{tMeta.roles.permissions}</FieldLabel>
                <Hint>{tMeta.roles.permissionsHint}</Hint>
              </div>
              <div className="grid max-h-72 gap-[8px_16px] overflow-y-auto [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
                {PERMISSIONS.map((p) => (
                  <Field key={p} orientation="horizontal">
                    <Checkbox
                      id={`edit-perm-${p}`}
                      checked={chosen.includes(p)}
                      disabled={denied !== undefined}
                      onCheckedChange={() => toggle(p)}
                    />
                    <FieldLabel htmlFor={`edit-perm-${p}`} className="font-normal">
                      {t.perm.names[p as Permission] ?? p}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </Field>
          )}

          {/* In the dialog, because the page behind it is hidden from a reader
              and covered for everyone else. */}
          {banner && (
            <Alert variant="destructive">
              <WarningCircle />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                className="text-destructive mr-auto"
                disabled={denied !== undefined || deleteBlocked !== undefined || remove.isPending}
                title={deleteBlocked ?? denied}
              >
                {tMeta.roles.delete}
              </Button>
            }
            title={tMeta.roles.deleteTitle}
            description={tMeta.roles.deleteHint(role.name)}
            confirmLabel={tMeta.roles.delete}
            tone="danger"
            requirePhrase={role.name}
            onConfirm={() => remove.mutate()}
          />
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            onClick={() => save.mutate()}
            disabled={denied !== undefined || save.isPending || name === ""}
            title={denied}
          >
            {save.isPending && <Spinner />}
            {t.assets.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
