import { useState } from "react"

import { api } from "@/lib/api"
import type { FieldDefinitionRow, FieldType } from "@/lib/metaTypes"
import { zh, zhConfig, zhMeta } from "@/i18n/zh"
import { CrudPage } from "@/features/metadata/CrudPage"
import { FieldEditor } from "@/features/fields/FieldEditor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  "text", "number", "boolean", "date", "enum", "reference", "mac", "ip", "url",
]
const expressionTypes: FieldType[] = ["computed"]

export function Fields() {
  const [editing, setEditing] = useState<FieldDefinitionRow | null>(null)
  const [key, setKey] = useState("")
  const [label, setLabel] = useState("")
  const [type, setType] = useState<FieldType>("text")
  const [isUnique, setIsUnique] = useState(false)
  const [template, setTemplate] = useState("")

  return (
    <>
      {editing && <FieldEditor field={editing} onClose={() => setEditing(null)} />}
    <CrudPage<FieldDefinitionRow>
      title={zhMeta.fields.title}
      queryKey="fields"
      list={() => api.get<FieldDefinitionRow[]>("/fields")}
      createLabel={zhMeta.fields.create}
      createDisabled={key === "" || label === ""}
      onCreated={() => {
        setKey("")
        setLabel("")
        setType("text")
        setIsUnique(false)
        setTemplate("")
      }}
      create={() =>
        api.post("/fields", {
          key,
          label,
          type,
          is_unique: isUnique,
          options: type === "computed" ? { template } : {},
        })
      }
      emptyTitle={zhMeta.fields.empty}
      emptyHint={zhMeta.fields.emptyHint}
      columns={[
        { header: zhMeta.fields.key, cell: (f) => <span className="font-mono">{f.key}</span> },
        { header: zhMeta.fields.label, cell: (f) => f.label },
        { header: zhMeta.fields.type, cell: (f) => zhMeta.fieldTypes[f.type] ?? f.type },
        {
          header: zhMeta.fields.unique,
          cell: (f) => (f.is_unique ? <Badge variant="outline">{zh.common.unique}</Badge> : null),
        },
        {
          header: "",
          cell: (f) => (
            <Button variant="ghost" size="sm" onClick={() => setEditing(f)}>
              {zhConfig.field.edit}
            </Button>
          ),
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="f-key">{zhMeta.fields.key}</FieldLabel>
            <Input id="f-key" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-label">{zhMeta.fields.label}</FieldLabel>
            <Input id="f-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-type">{zhMeta.fields.type}</FieldLabel>
            <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
              <SelectTrigger id="f-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* The two kinds are one enum in the database; the split lives
                    here, where it is the difference a person actually cares
                    about: is this value typed in, or worked out? */}
                <SelectGroup>
                  <SelectLabel>{zhConfig.field.staticGroup}</SelectLabel>
                  {staticTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {zhMeta.fieldTypes[t]}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{zhConfig.field.expressionGroup}</SelectLabel>
                  {expressionTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {zhMeta.fieldTypes[t]}
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
            <FieldLabel htmlFor="f-unique">{zhMeta.fields.unique}</FieldLabel>
          </Field>
          {type === "computed" && (
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="f-template">{zh.common.template}</FieldLabel>
              <Input
                id="f-template"
                className="font-mono"
                placeholder="{{ .attrs.mac | hex2dec }}"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
              <FieldDescription>{zhConfig.field.templateHint}</FieldDescription>
              <FieldDescription>{zhConfig.field.depsHint}</FieldDescription>
            </Field>
          )}
        </div>
      }
    />
    </>
  )
}
