import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Role, User } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

interface Props {
  user: User
  roles: Role[]
  onClose: () => void
}

/**
 * Moves one account onto another role.
 *
 * Its own dialog rather than a field on the account form, because the refusals
 * belong next to the act: the last administrator cannot be demoted, and nobody
 * changes their own role. Both come back from the server and are shown here,
 * where the change was asked for.
 */
export function ChangeRoleDialog({ user, roles, onClose }: Props) {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [roleID, setRoleID] = useState(user.role_id ?? "")
  const [banner, setBanner] = useState<string | null>(null)

  const denied = deniedReason("role.manage")

  const save = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/role`, { role_id: roleID }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      onClose()
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tMeta.roles.changeRoleTitle(user.name)}</DialogTitle>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="change-role">{tMeta.roles.ofUser}</FieldLabel>
          <Select value={roleID} onValueChange={setRoleID} disabled={denied !== undefined}>
            <SelectTrigger id="change-role">
              <SelectValue placeholder={t.common.select} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        {banner && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            onClick={() => save.mutate()}
            disabled={denied !== undefined || save.isPending || roleID === ""}
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
