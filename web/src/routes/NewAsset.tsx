import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useMutation, useQuery } from "@tanstack/react-query"

import { api, ApiError, type FieldErrors } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Asset, Category, CategorySchema, HolderEntity } from "@/lib/types"
import { zh } from "@/i18n/zh"
import { useAuth } from "@/features/auth/useAuth"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { ModelPicker } from "@/features/assets/ModelPicker"
import { StateBoundary } from "@/components/StateBoundary"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function NewAsset() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  // The quick-entry card on the overview arrives with a category already picked.
  const [categoryId, setCategoryId] = useState(searchParams.get("category_id") ?? "")
  const [holderId, setHolderId] = useState("")
  const [modelId, setModelId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const holders = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
  })
  const schema = useQuery({
    queryKey: ["schema", categoryId],
    queryFn: () => api.get<CategorySchema>(`/categories/${categoryId}/schema`),
    enabled: categoryId !== "",
  })

  const locations = (holders.data ?? []).filter((h) => h.type === "location")

  const create = useMutation({
    mutationFn: () =>
      api.post<Asset>("/assets", {
        category_id: categoryId,
        model_id: modelId,
        owner_id: user?.id,
        // Nothing exists yet on a fresh install, so the first asset may be held
        // by the person recording it rather than by a location.
        holder_type: holderId ? "entity" : "user",
        holder_id: holderId || user?.id,
        status: holderId ? "in_stock" : "in_use",
        attrs: values,
      }),
    onSuccess: (a) => navigate(`/assets/${a.id}`, { replace: true }),
    onError: (err) => {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields ?? {})
        setBanner(err.message)
      }
    },
  })

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-xl font-semibold">{zh.assets.newAsset}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{zh.assets.selectCategory}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="new-category">{zh.assets.category}</FieldLabel>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v)
                // A model belongs to one category chain; keeping the old choice
                // across a category change would silently attach the wrong one.
                setModelId(null)
              }}
            >
              <SelectTrigger id="new-category">
                <SelectValue placeholder={zh.common.select} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="new-holder">{zh.assets.holder}</FieldLabel>
            <Select value={toNone(holderId)} onValueChange={(v) => setHolderId(fromNone(v))}>
              <SelectTrigger id="new-holder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{user?.name ?? zh.common.none}</SelectItem>
                  {locations.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                      {h.is_default_stock ? zh.common.defaultStockSuffix : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {categoryId && (
        <Card>
          <CardHeader>
            <CardTitle>{schema.data?.category.name ?? zh.common.loading}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <StateBoundary isLoading={schema.isLoading} error={schema.error as Error | null}>
              <>
                <p className="text-sm text-muted-foreground">{zh.assets.generatedSN}</p>
                <ModelPicker
                  categoryID={categoryId}
                  value={modelId}
                  values={values}
                  onChange={(id, patch) => {
                    setModelId(id)
                    setValues((cur) => ({ ...cur, ...patch }))
                  }}
                />
                {schema.data && (
                  <DynamicForm
                    fields={schema.data.fields}
                    values={values}
                    errors={fieldErrors}
                    onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
                  />
                )}
              </>
            </StateBoundary>

            {banner && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{banner}</AlertDescription>
              </Alert>
            )}

            <div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Spinner data-icon="inline-start" aria-hidden />}
              {create.isPending ? zh.assets.saving : zh.assets.save}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
