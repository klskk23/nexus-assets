import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category } from "@/lib/types"
import type { FieldDefinitionRow, ProductModelRow } from "@/lib/metaTypes"
import { EXPRESSION_FIELD_TYPES, STATIC_FIELD_TYPES } from "@/lib/metaTypes"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tConfig, tMeta } from "@/i18n"
import { CategoryFilter } from "@/features/common/CategoryFilter"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { FieldEditor } from "@/features/fields/FieldEditor"
import { FieldForm, type FieldFormValue } from "@/features/fields/FieldForm"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** A blank field, and what "reset the form" means. */
const emptyDraft: FieldFormValue = {
  key: "",
  label: "",
  type: "text",
  isUnique: false,
  required: false,
  options: {},
  bindTo: [],
  bindMode: "category",
}

/**
 * Per type, and only what that type means: a regex on a computed field would
 * be configuration nothing reads.
 */
function optionsFor(d: FieldFormValue) {
  switch (d.type) {
    case "computed":
      return { template: d.options.template ?? "" }
    case "text":
      return { regex: d.options.regex ?? "", regex_hint: d.options.regex_hint ?? "" }
    case "number":
      return { min: d.options.min, max: d.options.max, unit: d.options.unit }
    default:
      return {}
  }
}

export function Fields() {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [editing, setEditing] = useState<FieldDefinitionRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // One object, because it is what FieldForm takes and what the create request
  // is built from -- the two used to be a dozen separate useStates that the
  // edit dialog then declared its own slightly different copies of.
  const [draft, setDraft] = useState<FieldFormValue>(emptyDraft)
  const patch = (p: Partial<FieldFormValue>) => setDraft((d) => ({ ...d, ...p }))



  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const categoryName = (id: string) =>
    (categories.data ?? []).find((c) => c.id === id)?.name ?? id

  // Loaded for the binding column: a model-bound field has to say which
  // models, and an id in that cell would be no better than saying nothing.
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  const modelList = Array.isArray(models.data) ? models.data : []
  const modelName = (id: string) => {
    const m = modelList.find((x) => x.id === id)
    if (!m) return id
    return m.vendor ? `${m.vendor} ${m.name}` : m.name
  }

  // How many devices a required binding would land on. Asked only when it
  // matters, and only for the categories actually ticked -- the answer is a
  // promise about somebody's next edit, not a reason to refuse anything.
  const bound = useQuery({
    queryKey: ["binding-asset-count", draft.bindMode, draft.bindTo],
    queryFn: async () => {
      const counts = await Promise.all(
        draft.bindTo.map((id) =>
          draft.bindMode === "model"
            ? api.get<{ total: number }>(`/models/${id}/required-impact`).then((r) => r.total)
            : api
                .get<{ total: number }>(`/assets?category_id=${id}&include_descendants=true&limit=1`)
                .then((r) => r.total),
        ),
      )
      return counts.reduce((a, b) => a + b, 0)
    },
    enabled: draft.bindTo.length > 0 && draft.required,
  })

  // The same delete the editor offers, reachable without opening it first --
  // which is the point of the context menu.
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/fields/${id}`),
    onSuccess: () => {
      setNotice(null)
      queryClient.invalidateQueries({ queryKey: ["fields"] })
    },
    onError: (e) => setNotice(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <>
      {editing && <FieldEditor field={editing} onClose={() => setEditing(null)} />}
    <CrudPage<FieldDefinitionRow>
      title={tMeta.fields.title}
      queryKey="fields"
      list={(params) => api.get<ListPage<FieldDefinitionRow>>(`/fields?${params}`)}
      searchHint={tMeta.fields.searchHint}
      filterKeys={{ category_id: "", type: "" }}
      filters={(qs) => (
        <>
          <CategoryFilter
            value={qs.filters.category_id}
            onChange={(v) => qs.setFilter("category_id", v)}
          />
          <Field className="w-auto">
            <FieldLabel htmlFor="f-type-filter" className="sr-only">
              {tMeta.fields.type}
            </FieldLabel>
            <Select
              value={toNone(qs.filters.type)}
              onValueChange={(v) => qs.setFilter("type", fromNone(v))}
            >
              <SelectTrigger id="f-type-filter" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{tMeta.fields.allTypes}</SelectItem>
                  {[...STATIC_FIELD_TYPES, ...EXPRESSION_FIELD_TYPES].map((k) => (
                    <SelectItem key={k} value={k}>
                      {tMeta.fieldTypes[k]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}
      createLabel={tMeta.fields.create}
      createDeniedReason={deniedReason("schema.manage")}
      createDisabled={draft.key === "" || draft.label === ""}
      onCreated={() => setDraft(emptyDraft)}
      create={() =>
        api.post("/fields", {
          key: draft.key,
          label: draft.label,
          type: draft.type,
          is_unique: draft.isUnique,
          // Bound in the same request, so a refused binding leaves no field
          // behind: the pair is what was asked for. One list or the other,
          // never both -- the server refuses a mix, and so does this.
          category_ids: draft.bindMode === "category" ? draft.bindTo : [],
          model_ids: draft.bindMode === "model" ? draft.bindTo : [],
          required: draft.required,
          options: optionsFor(draft),
        })
      }
      notice={
        notice && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )
      }
      onRowClick={(f) => setEditing(f)}
      rowActions={[
        { label: tConfig.field.edit, onSelect: (f) => setEditing(f) },
        {
          label: tConfig.field.delete,
          destructive: true,
          onSelect: (f) => remove.mutate(f.id),
          confirm: (f) => ({
            title: tConfig.field.deleteTitle,
            description: tConfig.field.deleteHint(f.label),
            phrase: f.key,
          }),
        },
      ]}
      emptyTitle={tMeta.fields.empty}
      emptyHint={tMeta.fields.emptyHint}
      columns={[
        { header: tMeta.fields.key, cell: (f) => <span className="font-mono">{f.key}</span> },
        { header: tMeta.fields.label, cell: (f) => f.label },
        { header: tMeta.fields.type, cell: (f) => tMeta.fieldTypes[f.type] ?? f.type },
        {
          // One column for both kinds of binding, and it says which kind.
          // Headed "所属类别" it called a model-bound field unbound -- true of
          // categories, and false about the field (015, decision 96).
          header: tMeta.fields.binding,
          cell: (f) => {
            const models = f.model_ids ?? []
            if (models.length > 0) {
              return (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{tMeta.fields.bindByModel}</Badge>
                  {models.map((id) => modelName(id)).join("、")}
                </span>
              )
            }
            const cats = f.category_ids ?? []
            if (cats.length === 0) {
              return <span className="text-muted-foreground">{tMeta.fields.unbound}</span>
            }
            return (
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{tMeta.fields.bindByCategory}</Badge>
                {cats.map((id) => categoryName(id)).join("、")}
              </span>
            )
          },
        },
        {
          // One cell can answer this now. While required was set per binding
          // it could not: a field required on one category and optional on
          // another has no single answer, and "部分必填" only told a reader
          // there was something to go and look at. It is the field's own flag
          // since 018, so it reads like 唯一 beside it.
          header: tMeta.categories.required,
          cell: (f) =>
            f.required ? <Badge variant="secondary">{tMeta.categories.required}</Badge> : null,
        },
        {
          // The scope differs with the binding mode, so the badge carries it
          // and the header stays a plain noun.
          header: tMeta.fields.unique,
          cell: (f) =>
            f.is_unique ? (
              <Badge variant="outline">
                {(f.model_ids ?? []).length > 0
                  ? tMeta.fields.uniqueInModels
                  : tMeta.fields.uniqueInCategory}
              </Badge>
            ) : null,
        },
      ]}
      form={
        <FieldForm
          mode="create"
          idPrefix="f"
          value={draft}
          onChange={patch}
          categories={categories.data ?? []}
          models={modelList}
          impact={bound.data}
        />
      }
    />
    </>
  )
}
