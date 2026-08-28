import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { HolderEntity } from "@/lib/types"
import { zhMeta } from "@/i18n/zh"
import { CrudPage } from "@/features/metadata/CrudPage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function Holders() {
  const [name, setName] = useState("")
  const [type, setType] = useState("location")
  const queryClient = useQueryClient()

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/holders/${id}`, { is_default_stock: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["holders"] }),
  })

  return (
    <CrudPage<HolderEntity>
      title={zhMeta.holders.title}
      queryKey="holders"
      list={() => api.get<HolderEntity[]>("/holders")}
      createLabel={zhMeta.holders.create}
      createDisabled={name === ""}
      create={() => api.post("/holders", { type, name })}
      emptyTitle={zhMeta.holders.empty}
      emptyHint={zhMeta.holders.emptyHint}
      columns={[
        { header: zhMeta.holders.name, cell: (h) => h.name },
        { header: zhMeta.holders.type, cell: (h) => zhMeta.entityTypes[h.type] ?? h.type },
        {
          header: zhMeta.holders.defaultStock,
          cell: (h) =>
            h.is_default_stock ? (
              <Badge>{zhMeta.holders.defaultStock}</Badge>
            ) : h.type === "location" ? (
              <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(h.id)}>
                {zhMeta.holders.setDefault}
              </Button>
            ) : null,
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="h-name">{zhMeta.holders.name}</Label>
            <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="h-type">{zhMeta.holders.type}</Label>
            <select
              id="h-type"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(zhMeta.entityTypes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
    />
  )
}
