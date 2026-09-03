import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Role } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { PERMISSIONS, usePermissions, type Permission } from "@/features/auth/usePermissions"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { RoleEditor } from "@/features/roles/RoleEditor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * Roles: a name and a set of switches, and which accounts are on each.
 *
 * The administrator is one of the rows, but its permissions are not a list of
 * ticks -- it means every permission, including ones a later version adds --
 * so the editor shows that rather than eighteen boxes somebody could clear.
 */
export function Roles() {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [editing, setEditing] = useState<Role | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [chosen, setChosen] = useState<string[]>([])

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/roles/${id}`),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["roles"] })
    },
    // Refusing to delete a role people are still on is the point, so the
    // reason has to reach the screen.
    onError: (e) => setBanner(e instanceof ApiError ? e.message : t.common.error),
  })

  const toggle = (p: string) =>
    setChosen((cur) => (cur.includes(p) ? cur.filter((k) => k !== p) : [...cur, p]))

  return (
    <>
      {editing && <RoleEditor role={editing} onClose={() => setEditing(null)} />}
      <CrudPage<Role>
        title={tMeta.roles.title}
        queryKey="roles"
        list={async () => {
          const res = await api.get<ListPage<Role>>("/roles")
          return res
        }}
        createLabel={tMeta.roles.create}
        createDeniedReason={deniedReason("role.manage")}
        createDisabled={name === ""}
        onCreated={() => {
          setName("")
          setChosen([])
        }}
        create={() => api.post("/roles", { name, permissions: chosen })}
        notice={
          banner && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{banner}</AlertDescription>
            </Alert>
          )
        }
        onRowClick={(r) => setEditing(r)}
        rowActions={[
          { label: tMeta.roles.edit, onSelect: (r) => setEditing(r) },
          {
            label: tMeta.roles.delete,
            destructive: true,
            // The administrator is not deletable while anybody is on it, and
            // the server refuses either way; the menu says so before the click.
            disabled: (r) => r.users > 0,
            onSelect: (r) => remove.mutate(r.id),
            confirm: (r) => ({
              title: tMeta.roles.deleteTitle,
              description: tMeta.roles.deleteHint(r.name),
              phrase: r.name,
            }),
          },
        ]}
        emptyTitle={tMeta.roles.empty}
        emptyHint={tMeta.roles.emptyHint}
        columns={[
          { header: tMeta.roles.name, cell: (r) => r.name },
          {
            header: tMeta.roles.permissions,
            cell: (r) =>
              r.is_admin ? (
                <Badge variant="secondary">{tMeta.roles.everything}</Badge>
              ) : (
                <span className="text-muted-foreground">
                  {tMeta.roles.countOf(r.permissions.length)}
                </span>
              ),
          },
          { header: tMeta.roles.accounts, cell: (r) => r.users },
        ]}
        form={
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="role-name">{tMeta.roles.name}</FieldLabel>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{tMeta.roles.permissions}</FieldLabel>
              <FieldDescription>{tMeta.roles.permissionsHint}</FieldDescription>
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
                {PERMISSIONS.map((p) => (
                  <Field key={p} orientation="horizontal">
                    <Checkbox
                      id={`perm-${p}`}
                      checked={chosen.includes(p)}
                      onCheckedChange={() => toggle(p)}
                    />
                    <FieldLabel htmlFor={`perm-${p}`} className="font-normal">
                      {t.perm.names[p as Permission] ?? p}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </Field>
          </div>
        }
      />
    </>
  )
}
