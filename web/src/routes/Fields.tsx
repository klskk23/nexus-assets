import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category } from "@/lib/types"
import type { FieldDefinitionRow, FieldType } from "@/lib/metaTypes"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tConfig, tMeta } from "@/i18n"
import { CategoryFilter } from "@/features/common/CategoryFilter"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { FieldEditor } from "@/features/fields/FieldEditor"
import { ExpressionHelp } from "@/features/fields/ExpressionHelp"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Static keys carry what someone typed or imported; an expression key carries
// what the system worked out from them. One enum in the database, two groups
// here, because that is the distinction a person is actually choosing between.
const staticTypes: FieldType[] = [
  "text", "number", "boolean", "date", "mac", "ip", "url",
]
const expressionTypes: FieldType[] = ["computed"]

export function Fields() {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [editing, setEditing] = useState<FieldDefinitionRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [key, setKey] = useState("")
  const [label, setLabel] = useState("")
  const [type, setType] = useState<FieldType>("text")
  const [isUnique, setIsUnique] = useState(false)
  const [template, setTemplate] = useState("")
  const [regex, setRegex] = useState("")
  const [regexHint, setRegexHint] = useState("")
  // Which categories the new field is bound to as it is created. A field bound
  // nowhere is on no entry form, so creating one used to be the first half of a
  // job that had to be finished in another dialog.
  const [bindTo, setBindTo] = useState<string[]>([])
  const [bindRequired, setBindRequired] = useState(false)



  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const categoryName = (id: string) =>
    (categories.data ?? []).find((c) => c.id === id)?.name ?? id

  // How many devices a required binding would land on. Asked only when it
  // matters, and only for the categories actually ticked -- the answer is a
  // promise about somebody's next edit, not a reason to refuse anything.
  const bound = useQuery({
    queryKey: ["category-asset-count", bindTo],
    queryFn: async () => {
      const counts = await Promise.all(
        bindTo.map((id) =>
          api
            .get<{ total: number }>(`/assets?category_id=${id}&include_descendants=true&limit=1`)
            .then((r) => r.total),
        ),
      )
      return counts.reduce((a, b) => a + b, 0)
    },
    enabled: bindTo.length > 0 && bindRequired,
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
                  {[...staticTypes, ...expressionTypes].map((k) => (
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
      createDisabled={key === "" || label === ""}
      onCreated={() => {
        setKey("")
        setLabel("")
        setType("text")
        setIsUnique(false)
        setTemplate("")
        setRegex("")
        setRegexHint("")
        setBindTo([])
        setBindRequired(false)
      }}
      create={() =>
        api.post("/fields", {
          key,
          label,
          type,
          is_unique: isUnique,
          // Bound in the same request, so a refused binding leaves no field
          // behind: the pair is what was asked for.
          category_ids: bindTo,
          required: bindRequired,
          // Per type, and only what that type means: a regex on a computed
          // field would be configuration nothing reads.
          options:
            type === "computed"
              ? { template }
              : type === "text"
                ? { regex, regex_hint: regexHint }
                : {},
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
          header: tMeta.fields.categories,
          cell: (f) =>
            (f.category_ids ?? []).length === 0 ? (
              <span className="text-muted-foreground">{tMeta.fields.unbound}</span>
            ) : (
              (f.category_ids ?? []).map((id) => categoryName(id)).join("、")
            ),
        },
        {
          header: tMeta.fields.unique,
          cell: (f) => (f.is_unique ? <Badge variant="outline">{t.common.unique}</Badge> : null),
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="f-key">{tMeta.fields.key}</FieldLabel>
            <Input id="f-key" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-label">{tMeta.fields.label}</FieldLabel>
            <Input id="f-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-type">{tMeta.fields.type}</FieldLabel>
            <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
              <SelectTrigger id="f-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* The two kinds are one enum in the database; the split lives
                    here, where it is the difference a person actually cares
                    about: is this value typed in, or worked out? */}
                <SelectGroup>
                  <SelectLabel>{tConfig.field.staticGroup}</SelectLabel>
                  {staticTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {tMeta.fieldTypes[t]}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{tConfig.field.expressionGroup}</SelectLabel>
                  {expressionTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {tMeta.fieldTypes[t]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" className="pt-6">
            <Checkbox
              id="f-unique"
              checked={isUnique}
              onCheckedChange={(v) => setIsUnique(v === true)}
            />
            <FieldLabel htmlFor="f-unique">{tMeta.fields.unique}</FieldLabel>
          </Field>
          {/* The pattern a value must match, and the sentence shown when it
              does not. Both were editable only after the field existed, which
              made creating a validated field a two-step job for no reason. */}
          {type === "text" && (
            <>
              <Field>
                <FieldLabel htmlFor="f-regex">{tConfig.field.regex}</FieldLabel>
                <Input
                  id="f-regex"
                  className="font-mono"
                  placeholder="^[A-Z]{2}-\d{4}$"
                  value={regex}
                  onChange={(e) => setRegex(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-regex-hint">{tConfig.field.regexHint}</FieldLabel>
                <Input
                  id="f-regex-hint"
                  value={regexHint}
                  onChange={(e) => setRegexHint(e.target.value)}
                />
              </Field>
            </>
          )}

          <Field className="sm:col-span-2">
            <FieldLabel>{tMeta.fields.bindOnCreate}</FieldLabel>
            <FieldDescription>{tMeta.fields.bindOnCreateHint}</FieldDescription>
            <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto">
              {(categories.data ?? []).map((c) => (
                <Field key={c.id} orientation="horizontal">
                  <Checkbox
                    id={`f-bind-${c.id}`}
                    checked={bindTo.includes(c.id)}
                    onCheckedChange={(v) =>
                      setBindTo((cur) =>
                        v === true ? [...cur, c.id] : cur.filter((id) => id !== c.id),
                      )
                    }
                  />
                  <FieldLabel htmlFor={`f-bind-${c.id}`} className="font-normal">
                    {c.name}
                  </FieldLabel>
                </Field>
              ))}
            </div>
            {bindTo.length > 0 && (
              <Field orientation="horizontal">
                <Checkbox
                  id="f-bind-required"
                  checked={bindRequired}
                  onCheckedChange={(v) => setBindRequired(v === true)}
                />
                <FieldLabel htmlFor="f-bind-required">{tMeta.categories.required}</FieldLabel>
              </Field>
            )}
            {/* Required is a write-time rule, not a data invariant: existing
                devices keep what they have, and the next edit of one is where
                it is asked for. Whoever ticks this should know that. */}
            {bindTo.length > 0 && bindRequired && bound.data !== undefined && bound.data > 0 && (
              <FieldDescription>{tMeta.categories.requiredWarning(bound.data)}</FieldDescription>
            )}
          </Field>

          {type === "computed" && (
            <Field className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="f-template">{t.common.template}</FieldLabel>
                <ExpressionHelp />
              </div>
              <Input
                id="f-template"
                className="font-mono"
                placeholder="hex2dec(attrs.mac)"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
              <FieldDescription>{tConfig.field.templateHint}</FieldDescription>
              <FieldDescription>{tConfig.field.depsHint}</FieldDescription>
            </Field>
          )}
        </div>
      }
    />
    </>
  )
}
