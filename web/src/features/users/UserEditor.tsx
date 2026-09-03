import { AlertCircleIcon, InfoIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Role, User } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  user: User
  roles: Role[]
  onClose: () => void
}

/**
 * Everything an administrator may change about one account, in one dialog.
 *
 * The page had a context menu with two entries and no way to edit a row, which
 * left three things unreachable from the interface: reviving an account
 * stopped by a misclick, correcting a name, and resetting a password. Each is
 * ordinary enough that going to the database for it is the wrong answer.
 *
 * Refusals appear in here rather than on the page behind, which is aria-hidden
 * and covered while this is open.
 */
export function UserEditor({ user, roles, onClose }: Props) {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [name, setName] = useState(user.name)
  const [roleID, setRoleID] = useState(user.role_id ?? "")
  const [password, setPassword] = useState("")
  const [resetting, setResetting] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const deniedUsers = deniedReason("user.manage")
  const deniedRoles = deniedReason("role.manage")
  const local = user.auth_type === "local"

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] })
    queryClient.invalidateQueries({ queryKey: ["roles"] })
  }
  const refuse = (e: unknown) => setBanner(e instanceof ApiError ? e.message : t.common.error)

  // The name and the role go to two endpoints, because the role carries two
  // guards of its own -- the last administrator cannot be demoted and nobody
  // changes their own role -- and both refusals have to be attributable.
  const save = useMutation({
    mutationFn: async () => {
      if (name !== user.name) await api.patch(`/users/${user.id}`, { name })
      if (roleID !== (user.role_id ?? "")) {
        await api.patch(`/users/${user.id}/role`, { role_id: roleID })
      }
    },
    onSuccess: () => {
      setBanner(null)
      refresh()
      onClose()
    },
    onError: refuse,
  })

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => api.patch(`/users/${user.id}`, { disable: !enabled }),
    onSuccess: () => {
      setBanner(null)
      refresh()
      onClose()
    },
    onError: refuse,
  })

  const reset = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/password`, { password }),
    onSuccess: () => {
      setBanner(null)
      setPassword("")
      setDone(tMeta.users.passwordDone)
      refresh()
    },
    onError: refuse,
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      {/* Taller than a short screen once the two action sections are on it,
          so it scrolls inside itself rather than off the top of the window. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tMeta.users.editTitle(user.name)}</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-email">{tMeta.users.email}</FieldLabel>
            {/* Read-only rather than absent: it is the thing that identifies
                this row, and hiding it would make the dialog ambiguous. */}
            <Input id="edit-email" value={user.email} readOnly disabled />
            <FieldDescription>{tMeta.users.emailFixed}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-name">{tMeta.users.name}</FieldLabel>
            <Input
              id="edit-name"
              value={name}
              disabled={deniedUsers !== undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-role">{tMeta.roles.ofUser}</FieldLabel>
            <Select
              value={roleID}
              onValueChange={setRoleID}
              disabled={deniedRoles !== undefined}
            >
              <SelectTrigger id="edit-role">
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

          <FieldSet>
            <FieldLegend variant="label">{tMeta.users.status}</FieldLegend>
            <FieldDescription>
              {user.status === "active" ? tMeta.users.active : tMeta.users.disabled}
            </FieldDescription>
            {user.status === "active" ? (
              <ConfirmDialog
                trigger={
                  <Button
                    variant="destructive"
                    className="w-fit"
                    disabled={deniedUsers !== undefined}
                    title={deniedUsers}
                  >
                    {tMeta.users.disable}
                  </Button>
                }
                title={tMeta.users.disableTitle}
                description={tMeta.users.disableHint(user.name)}
                confirmLabel={tMeta.users.disable}
                requirePhrase={user.email}
                onConfirm={() => setEnabled.mutate(false)}
              />
            ) : (
              // Letting somebody back in takes nothing away from anybody, so
              // it asks for no typed confirmation.
              <Button
                variant="outline"
                className="w-fit"
                disabled={deniedUsers !== undefined || setEnabled.isPending}
                title={deniedUsers}
                onClick={() => setEnabled.mutate(true)}
              >
                {setEnabled.isPending && <Spinner data-icon="inline-start" aria-hidden />}
                {tMeta.users.enable}
              </Button>
            )}
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">{tMeta.users.resetPassword}</FieldLegend>
            <FieldDescription>
              {local ? tMeta.users.resetPasswordHint(user.name) : tMeta.users.resetPasswordSSO}
            </FieldDescription>
            <Field>
              <FieldLabel htmlFor="edit-password">{tMeta.users.newPassword}</FieldLabel>
              <Input
                id="edit-password"
                type="password"
                value={password}
                disabled={!local || deniedUsers !== undefined}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button
              variant="outline"
              className="w-fit"
              disabled={!local || password === "" || deniedUsers !== undefined || reset.isPending}
              title={deniedUsers}
              onClick={() => setResetting(true)}
            >
              {reset.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {tMeta.users.resetPassword}
            </Button>
            <ConfirmDialog
              open={resetting}
              onOpenChange={setResetting}
              title={tMeta.users.resetPassword}
              description={tMeta.users.resetPasswordHint(user.name)}
              confirmLabel={tMeta.users.resetPassword}
              requirePhrase={user.email}
              onConfirm={() => {
                setResetting(false)
                reset.mutate()
              }}
            />
          </FieldSet>
        </FieldGroup>

        {done && (
          <Alert role="status">
            <InfoIcon />
            <AlertDescription>{done}</AlertDescription>
          </Alert>
        )}
        {banner && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || name.trim() === "" || deniedUsers !== undefined}
            title={deniedUsers}
          >
            {save.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {t.assets.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
