import { AlertCircleIcon } from "lucide-react"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
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

  const toggle = (p: string) =>
    setChosen((cur) => (cur.includes(p) ? cur.filter((k) => k !== p) : [...cur, p]))

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
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
            <FieldDescription>{tMeta.roles.adminFixed}</FieldDescription>
          ) : (
            <Field>
              <FieldLabel>{tMeta.roles.permissions}</FieldLabel>
              <FieldDescription>{tMeta.roles.permissionsHint}</FieldDescription>
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
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
              <AlertCircleIcon />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            onClick={() => save.mutate()}
            disabled={denied !== undefined || save.isPending || name === ""}
            title={denied}
          >
            {save.isPending && <Spinner data-icon="inline-start" />}
            {t.assets.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
