import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { FieldDefinitionRow, FieldType } from "@/lib/metaTypes"
import { t, tConfig, tMeta } from "@/i18n"
import { CrudPage } from "@/features/metadata/CrudPage"
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
  const [editing, setEditing] = useState<FieldDefinitionRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [key, setKey] = useState("")
  const [label, setLabel] = useState("")
  const [type, setType] = useState<FieldType>("text")
  const [isUnique, setIsUnique] = useState(false)
  const [template, setTemplate] = useState("")
  const [regex, setRegex] = useState("")
  const [regexHint, setRegexHint] = useState("")

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
      list={() => api.get<FieldDefinitionRow[]>("/fields")}
      createLabel={tMeta.fields.create}
      createDisabled={key === "" || label === ""}
      onCreated={() => {
        setKey("")
        setLabel("")
        setType("text")
        setIsUnique(false)
        setTemplate("")
        setRegex("")
        setRegexHint("")
      }}
      create={() =>
        api.post("/fields", {
          key,
          label,
          type,
          is_unique: isUnique,
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
