import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { zhMeta } from "@/i18n/zh"
import { CrudPage } from "@/features/metadata/CrudPage"
import {
  AttrDefaultsEditor,
  toAttrDefaults,
  type DefaultRow,
} from "@/features/metadata/AttrDefaultsEditor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function Models() {
  const [name, setName] = useState("")
  const [vendor, setVendor] = useState("")
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [defaults, setDefaults] = useState<DefaultRow[]>([])

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
      createDisabled={name === ""}
      create={() =>
        api.post("/models", {
          category_ids: categoryIds,
          name,
          vendor,
          attr_defaults: toAttrDefaults(defaults),
        })
      }
      emptyTitle={zhMeta.models.empty}
      emptyHint={zhMeta.models.emptyHint}
      columns={[
        { header: zhMeta.models.name, cell: (m) => m.name },
        { header: zhMeta.models.vendor, cell: (m) => m.vendor ?? "" },
        {
          header: zhMeta.models.category,
          cell: (m) =>
            (m.category_ids ?? []).map((id) => byId.get(id) ?? id).join("、") ||
            zhMeta.models.noCategory,
        },
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
            {/* One device can genuinely be both a router and a spare, so this
                is a multi-select rather than a choice between two right
                answers. */}
            <select
              id="m-category"
              multiple
              size={4}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              value={categoryIds}
              onChange={(e) =>
                setCategoryIds(Array.from(e.target.selectedOptions, (o) => o.value))
              }
            >
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{zhMeta.models.categoryHint}</p>
          </div>
          <div className="sm:col-span-3">
            <AttrDefaultsEditor rows={defaults} onChange={setDefaults} />
          </div>
        </div>
      }
    />
  )
}
