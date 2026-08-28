import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { zhMeta } from "@/i18n/zh"
import { CrudPage } from "@/features/metadata/CrudPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function Models() {
  const [name, setName] = useState("")
  const [vendor, setVendor] = useState("")
  const [categoryId, setCategoryId] = useState("")

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const byId = new Map((categories.data ?? []).map((c) => [c.id, c.name]))

  return (
    <CrudPage<ProductModelRow>
      title={zhMeta.models.title}
      queryKey="models"
      list={() => api.get<ProductModelRow[]>("/models")}
      createLabel={zhMeta.models.create}
      createDisabled={name === "" || categoryId === ""}
      create={() => api.post("/models", { category_id: categoryId, name, vendor })}
      emptyTitle={zhMeta.models.empty}
      emptyHint={zhMeta.models.emptyHint}
      columns={[
        { header: zhMeta.models.name, cell: (m) => m.name },
        { header: zhMeta.models.vendor, cell: (m) => m.vendor ?? "" },
        { header: zhMeta.models.category, cell: (m) => byId.get(m.category_id) ?? m.category_id },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="m-name">{zhMeta.models.name}</Label>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-vendor">{zhMeta.models.vendor}</Label>
            <Input id="m-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-category">{zhMeta.models.category}</Label>
            <select
              id="m-category"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">—</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
    />
  )
}
