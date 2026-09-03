import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Role, User } from "@/lib/types"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, FieldLabel } from "@/components/ui/field"
import { NONE, fromNone, toNone } from "@/lib/select"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChangeRoleDialog } from "@/features/roles/ChangeRoleDialog"

export function Users() {
  const [email, setEmail] = useState("")
  const [roleID, setRoleID] = useState("")
  const [changing, setChanging] = useState<User | null>(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [banner, setBanner] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()

  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<ListPage<Role>>("/roles"),
  })
  const roleName = (id?: string) =>
    (roles.data?.items ?? []).find((r) => r.id === id)?.name ?? t.common.none

  const disable = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}`, { disable: true }),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
    // Refusing to disable someone who still owns devices is the point, so the
    // reason has to reach the screen rather than vanish.
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  return (
    <>
      {changing && (
        <ChangeRoleDialog
          user={changing}
          roles={roles.data?.items ?? []}
          onClose={() => setChanging(null)}
        />
      )}
      <CrudPage<User>
        title={tMeta.users.title}
        queryKey="users"
        searchHint={tMeta.users.searchHint}
        filterKeys={{ role_id: "", status: "" }}
        filters={(qs) => (
          <UserFilters
            roles={roles.data?.items ?? []}
            roleID={qs.filters.role_id}
            status={qs.filters.status}
            onRole={(v) => qs.setFilter("role_id", v)}
            onStatus={(v) => qs.setFilter("status", v)}
          />
        )}
        list={(params) => api.get<ListPage<User>>(`/users?${params}`)}
        createLabel={tMeta.users.create}
        // Disabling an account is a row action; its refusal has to appear next
        // to the rows rather than inside the create dialog.
        notice={
          banner && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )
        }
        createDeniedReason={deniedReason("user.manage")}
        createDisabled={email === "" || password === "" || roleID === ""}
        onCreated={() => {
          setEmail("")
          setName("")
          setPassword("")
          setRoleID("")
        }}
        create={() => api.post("/users", { email, name, password, role_id: roleID })}
        // Accounts cannot be deleted -- actor_id references them from every
        // audit entry -- so disabling is the only lifecycle action there is.
        rowActions={[
          {
            label: tMeta.roles.changeRole,
            onSelect: (u) => setChanging(u),
          },
          {
            label: tMeta.users.disable,
            destructive: true,
            disabled: (u) => u.status !== "active",
            onSelect: (u) => disable.mutate(u.id),
            confirm: (u) => ({
              title: tMeta.users.disableTitle,
              description: tMeta.users.disableHint(u.name),
              phrase: u.email,
            }),
          },
        ]}
        emptyTitle={tMeta.users.empty}
        emptyHint={tMeta.users.emptyHint}
        columns={[
          { header: tMeta.users.email, cell: (u) => u.email },
          { header: tMeta.users.name, cell: (u) => u.name },
          { header: tMeta.roles.ofUser, cell: (u) => roleName(u.role_id) },
          {
            header: tMeta.users.status,
            cell: (u) =>
              u.status === "active" ? (
                <Badge variant="secondary">{tMeta.users.active}</Badge>
              ) : (
                <Badge variant="outline">{tMeta.users.disabled}</Badge>
              ),
          },
        ]}
        form={
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="u-email">{tMeta.users.email}</Label>
                <Input
                  id="u-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-name">{tMeta.users.name}</Label>
                <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-role">{tMeta.roles.ofUser}</Label>
                {/* Chosen when the account is made, with no default: an account
                  whose permissions nobody decided is the kind that turns out
                  to have been an administrator. */}
                <Select value={roleID} onValueChange={setRoleID}>
                  <SelectTrigger id="u-role">
                    <SelectValue placeholder={t.common.select} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(roles.data?.items ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-password">{tMeta.users.password}</Label>
                <Input
                  id="u-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </>
        }
      />
    </>
  )
}

/** Which role somebody is on, and whether the account is still open. */
function UserFilters({
  roles,
  roleID,
  status,
  onRole,
  onStatus,
}: {
  roles: Role[]
  roleID: string
  status: string
  onRole: (v: string) => void
  onStatus: (v: string) => void
}) {
  return (
    <>
      <Field className="w-auto">
        <FieldLabel htmlFor="u-filter-role" className="sr-only">
          {tMeta.roles.ofUser}
        </FieldLabel>
        <Select value={toNone(roleID)} onValueChange={(v) => onRole(fromNone(v))}>
          <SelectTrigger id="u-filter-role" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NONE}>{tMeta.users.allRoles}</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field className="w-auto">
        <FieldLabel htmlFor="u-filter-status" className="sr-only">
          {tMeta.users.status}
        </FieldLabel>
        <Select value={toNone(status)} onValueChange={(v) => onStatus(fromNone(v))}>
          <SelectTrigger id="u-filter-status" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NONE}>{tMeta.users.allStatuses}</SelectItem>
              <SelectItem value="active">{tMeta.users.active}</SelectItem>
              <SelectItem value="disabled">{tMeta.users.disabled}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}
