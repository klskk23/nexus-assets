import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Category, CategorySchema } from "@/lib/types"
import type { FieldDefinitionRow } from "@/lib/metaTypes"
import { zh, zhMeta } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
import { CollapsibleTree, buildTree } from "@/features/tree/CollapsibleTree"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { DisplayKeyEditor } from "@/features/categories/DisplayKeyEditor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function Categories() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string>("")
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState("")
  const [bindField, setBindField] = useState("")
  const [bindRequired, setBindRequired] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const fields = useQuery({
    queryKey: ["fields"],
    queryFn: () => api.get<FieldDefinitionRow[]>("/fields"),
  })
  const schema = useQuery({
    queryKey: ["schema", selected],
    queryFn: () => api.get<CategorySchema>(`/categories/${selected}/schema`),
    enabled: selected !== "",
  })

  const unbind = useMutation({
    mutationFn: (fieldID: string) =>
      api.del(`/categories/${selected}/bindings/${fieldID}`),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["schema", selected] })
      queryClient.invalidateQueries({ queryKey: ["category-schema", selected] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : zh.common.error),
  })

  const create = useMutation({
    mutationFn: () =>
      api.post("/categories", {
        code,
        name,
        parent_id: parentId || null,
      }),
    onSuccess: () => {
      setBanner(null)
      setCode("")
      setName("")
      queryClient.invalidateQueries({ queryKey: ["categories"] })
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : zh.common.error),
  })

  const bind = useMutation({
    mutationFn: () =>
      api.post(`/categories/${selected}/bindings`, { field_id: bindField, required: bindRequired }),
    onSuccess: () => {
      setBanner(null)
      queryClient.invalidateQueries({ queryKey: ["schema", selected] })
    },
    // A key already bound higher on the chain is refused; the message names it.
    onError: (e) => setBanner(e instanceof ApiError ? e.message : zh.common.error),
  })

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">{zhMeta.categories.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{zhMeta.categories.create}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="c-code">{zhMeta.categories.code}</Label>
              <Input id="c-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">{zhMeta.categories.name}</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-parent">{zhMeta.categories.parent}</Label>
              <select
                id="c-parent"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
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
          {banner && (
            <p role="alert" className="text-sm text-destructive">
              {banner}
            </p>
          )}
          <div>
            <Button onClick={() => create.mutate()} disabled={code === "" || name === ""}>
              {zhMeta.categories.create}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{zhMeta.categories.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <StateBoundary
              isLoading={categories.isLoading}
              error={categories.error as Error | null}
              isEmpty={categories.data?.length === 0}
              emptyTitle={zhMeta.categories.empty}
              emptyHint={zhMeta.categories.emptyHint}
            >
              <CollapsibleTree
                nodes={buildTree(categories.data ?? [])}
                selectedId={selected}
                onSelect={setSelected}
              />
            </StateBoundary>
          </CardContent>
        </Card>

        {selected && (
          <div className="grid gap-6">
            {schema.data && (
              <DisplayKeyEditor
                key={selected}
                categoryID={selected}
                categoryName={schema.data.category.name}
                displayKey={schema.data.category.display_key}
                fields={schema.data.fields}
              />
            )}
          <Card>
            <CardHeader>
              <CardTitle>{zhMeta.categories.fields}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="c-bind">{zhMeta.categories.bind}</Label>
                  <select
                    id="c-bind"
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                    value={bindField}
                    onChange={(e) => setBindField(e.target.value)}
                  >
                    <option value="">—</option>
                    {(fields.data ?? []).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id="c-required"
                    checked={bindRequired}
                    onCheckedChange={(v) => setBindRequired(v === true)}
                  />
                  <Label htmlFor="c-required">{zhMeta.categories.required}</Label>
                </div>
                <Button
                  className="mb-0.5"
                  onClick={() => bind.mutate()}
                  disabled={bindField === ""}
                >
                  {zhMeta.categories.bind}
                </Button>
              </div>

              <ul className="grid gap-2">
                {(schema.data?.fields ?? []).map((f) => (
                  <li key={f.key} aria-label={f.label} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-muted-foreground">{f.key}</span>
                    <span>{f.label}</span>
                    {f.required && <Badge variant="outline">{zhMeta.categories.required}</Badge>}
                    {f.inherited_from ? (
                      <Badge variant="secondary">
                        {zhMeta.categories.inheritedFrom}
                        {(categories.data ?? []).find((c) => c.id === f.inherited_from)?.name ?? ""}
                      </Badge>
                    ) : (
                      // Unbinding is how a field that assets already carry
                      // values for gets retired -- deleting it would be
                      // refused, and there is no longer an archive to fall
                      // back on. Only bindings made here can be removed here.
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm" className="ml-auto">
                            {zhMeta.categories.unbind}
                          </Button>
                        }
                        title={zhMeta.categories.unbindTitle}
                        description={zhMeta.categories.unbindHint(f.label)}
                        confirmLabel={zhMeta.categories.unbind}
                        onConfirm={() => unbind.mutate(f.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </div>
  )
}
