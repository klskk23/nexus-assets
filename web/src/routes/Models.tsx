import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { tMeta } from "@/i18n"
import { CrudPage } from "@/features/metadata/CrudPage"
import {
  AttrDefaultsEditor,
  toAttrDefaults,
  type DefaultRow,
} from "@/features/metadata/AttrDefaultsEditor"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"

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
      title={tMeta.models.title}
      queryKey="models"
      list={() => api.get<ProductModelRow[]>("/models")}
      createLabel={tMeta.models.create}
      createDisabled={name === ""}
      onCreated={() => {
        setName("")
        setVendor("")
        setCategoryIds([])
        setDefaults([])
      }}
      create={() =>
        api.post("/models", {
          category_ids: categoryIds,
          name,
          vendor,
          attr_defaults: toAttrDefaults(defaults),
        })
      }
      emptyTitle={tMeta.models.empty}
      emptyHint={tMeta.models.emptyHint}
      columns={[
        { header: tMeta.models.name, cell: (m) => m.name },
        { header: tMeta.models.vendor, cell: (m) => m.vendor ?? "" },
        {
          header: tMeta.models.category,
          cell: (m) =>
            (m.category_ids ?? []).map((id) => byId.get(id) ?? id).join("、") ||
            tMeta.models.noCategory,
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="m-name">{tMeta.models.name}</FieldLabel>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="m-vendor">{tMeta.models.vendor}</FieldLabel>
            <Input id="m-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </Field>
          {/* One device can genuinely be both a router and a spare, so several
              categories can be ticked. A dropdown cannot express that, and a
              multi-select list box hides the choices behind a scroll -- here
              the whole set is visible at once. */}
          <FieldSet className="sm:col-span-3">
            <FieldLegend variant="label">{tMeta.models.category}</FieldLegend>
            <FieldDescription>{tMeta.models.categoryHint}</FieldDescription>
            <FieldGroup className="flex flex-row flex-wrap items-center gap-4">
              {(categories.data ?? []).map((c) => (
                <Field key={c.id} orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={`m-cat-${c.id}`}
                    checked={categoryIds.includes(c.id)}
                    onCheckedChange={(v) =>
                      setCategoryIds((cur) =>
                        v === true ? [...cur, c.id] : cur.filter((id) => id !== c.id),
                      )
                    }
                  />
                  <FieldLabel htmlFor={`m-cat-${c.id}`}>{c.name}</FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
          <div className="sm:col-span-3">
            <AttrDefaultsEditor rows={defaults} onChange={setDefaults} />
          </div>
        </div>
      }
    />
  )
}
