import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { User } from "@/lib/types"
import { zh, zhMeta } from "@/i18n/zh"
import { CrudPage } from "@/features/metadata/CrudPage"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function Users() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [banner, setBanner] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const disable = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}`, { disable: true }),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
    // Refusing to disable someone who still owns devices is the point, so the
    // reason has to reach the screen rather than vanish.
    onError: (err) => setBanner(err instanceof ApiError ? err.message : zh.common.error),
  })

  return (
    <CrudPage<User>
      title={zhMeta.users.title}
      queryKey="users"
      list={() => api.get<User[]>("/users")}
      createLabel={zhMeta.users.create}
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
      createDisabled={email === "" || password === ""}
      onCreated={() => {
        setEmail("")
        setName("")
        setPassword("")
      }}
      create={() => api.post("/users", { email, name, password })}
      emptyTitle={zhMeta.users.empty}
      emptyHint={zhMeta.users.emptyHint}
      columns={[
        { header: zhMeta.users.email, cell: (u) => u.email },
        { header: zhMeta.users.name, cell: (u) => u.name },
        {
          header: zhMeta.users.status,
          cell: (u) =>
            u.status === "active" ? (
              <Badge variant="secondary">{zhMeta.users.active}</Badge>
            ) : (
              <Badge variant="outline">{zhMeta.users.disabled}</Badge>
            ),
        },
        {
          header: "",
          cell: (u) =>
            u.status === "active" ? (
              <Button variant="ghost" size="sm" onClick={() => disable.mutate(u.id)}>
                {zhMeta.users.disable}
              </Button>
            ) : null,
        },
      ]}
      form={
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="u-email">{zhMeta.users.email}</Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-name">{zhMeta.users.name}</Label>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-password">{zhMeta.users.password}</Label>
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
  )
}
