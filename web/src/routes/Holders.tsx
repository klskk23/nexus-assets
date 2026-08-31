import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type Blocker, blockerKey } from "@/lib/api"
import {
  ALLOWED_PARENTS,
  PARENT_REQUIRED,
  type EntityType,
  type HolderEntity,
} from "@/lib/types"
import { NONE, fromNone, toNone } from "@/lib/select"
import { zh, zhMeta } from "@/i18n/zh"
import { CrudPage } from "@/features/metadata/CrudPage"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function Holders() {
  const [name, setName] = useState("")
  const [type, setType] = useState<EntityType>("location")
  const [parentID, setParentID] = useState("")
  const [note, setNote] = useState("")
  const queryClient = useQueryClient()

  const [banner, setBanner] = useState<string | null>(null)
  // The server has attached the blocking devices since the first version; the
  // client used to parse only `referrers` and drop these on the floor, leaving
  // the page with a count and no way to act on it.
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [blockerTotal, setBlockerTotal] = useState(0)

  // Read separately from CrudPage's own list so the form can offer parents and
  // resolve names; it is the same query key, so there is one fetch.
  const all = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
  })
  const holders = all.data ?? []
  const byID = new Map(holders.map((h) => [h.id, h]))

  // A department has to belong to a company, so with no company on file the
  // option is offered and disabled rather than silently missing -- "why is
  // 部门 not in the list" is a worse question than a greyed-out row with a
  // reason under it.
  const eligibleParents = holders.filter((h) => ALLOWED_PARENTS[type].includes(h.type))
  const hasCompany = holders.some((h) => h.type === "company")

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/holders/${id}`, { is_default_stock: true }),
    onSuccess: () => {
      setBanner(null)
      setBlockers([])
      queryClient.invalidateQueries({ queryKey: ["holders"] })
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setBanner(e.message)
        setBlockers(e.blockers ?? [])
        setBlockerTotal(e.total ?? 0)
      } else {
        setBanner(zh.common.error)
      }
    },
  })

  return (
    <CrudPage<HolderEntity>
      title={zhMeta.holders.title}
      queryKey="holders"
      list={() => api.get<HolderEntity[]>("/holders")}
      createLabel={zhMeta.holders.create}
      // Setting the default stock marker is a row action, so its refusal
      // belongs beside the rows -- not inside the create dialog.
      notice={
        banner && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{zhMeta.holders.blocked}</AlertTitle>
            <AlertDescription className="grid gap-1">
              {banner}
              {blockers.length > 0 && (
                <>
                  <p className="text-xs">{zhMeta.holders.blockedBy}</p>
                  <ul className="grid gap-0.5 font-mono text-xs">
                    {blockers.map((b) => (
                      <li key={blockerKey(b)}>{b.name}</li>
                    ))}
                    {blockerTotal > blockers.length && (
                      <li>{zhMeta.holders.blockedMore(blockerTotal)}</li>
                    )}
                  </ul>
                </>
              )}
            </AlertDescription>
          </Alert>
        )
      }
      createDisabled={name === "" || (PARENT_REQUIRED[type] && parentID === "")}
      onCreated={() => {
        setName("")
        setType("location")
        setParentID("")
        setNote("")
      }}
      create={() =>
        api.post("/holders", { type, name, note, parent_id: parentID || null })
      }
      emptyTitle={zhMeta.holders.empty}
      emptyHint={zhMeta.holders.emptyHint}
      columns={[
        { header: zhMeta.holders.name, cell: (h) => h.name },
        { header: zhMeta.holders.type, cell: (h) => zhMeta.entityTypes[h.type] ?? h.type },
        {
          header: zhMeta.holders.parent,
          cell: (h) =>
            h.parent_id ? (
              byID.get(h.parent_id)?.name ?? h.parent_id
            ) : (
              <span className="text-muted-foreground">{zhMeta.holders.noParent}</span>
            ),
        },
        {
          header: zhMeta.holders.note,
          cell: (h) => <span className="text-muted-foreground text-sm">{h.note}</span>,
        },
        {
          header: zhMeta.holders.defaultStock,
          // The marker moves but never switches off, so the current holder gets
          // a badge with no control rather than a toggle that would be refused.
          cell: (h) =>
            h.is_default_stock ? (
              <Badge>{zhMeta.holders.defaultStock}</Badge>
            ) : h.type === "location" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={setDefault.isPending}
                onClick={() => setDefault.mutate(h.id)}
              >
                {zhMeta.holders.setDefault}
              </Button>
            ) : null,
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="h-name">{zhMeta.holders.name}</FieldLabel>
            <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="h-type">{zhMeta.holders.type}</FieldLabel>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as EntityType)
                // The eligible parents differ per kind, so a carried-over
                // choice would be one the server is about to refuse.
                setParentID("")
              }}
            >
              <SelectTrigger id="h-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(zhMeta.entityTypes).map(([k, v]) => (
                    <SelectItem
                      key={k}
                      value={k}
                      disabled={k === "department" && !hasCompany}
                    >
                      {v}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {type === "department" && !hasCompany && (
              <FieldDescription>{zhMeta.holders.noCompanyYet}</FieldDescription>
            )}
          </Field>

          {ALLOWED_PARENTS[type].length > 0 && (
            <Field>
              <FieldLabel htmlFor="h-parent">{zhMeta.holders.parent}</FieldLabel>
              <Select value={toNone(parentID)} onValueChange={(v) => setParentID(fromNone(v))}>
                <SelectTrigger id="h-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {/* A department has no "no parent" option: the rule is not
                        a suggestion, and offering the choice would only lead
                        to a refusal. */}
                    {!PARENT_REQUIRED[type] && (
                      <SelectItem value={NONE}>{zhMeta.holders.noParent}</SelectItem>
                    )}
                    {eligibleParents.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}（{zhMeta.entityTypes[h.type] ?? h.type}）
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {PARENT_REQUIRED[type] && (
                <FieldDescription>
                  {zhMeta.holders.parentRequired(
                    zhMeta.entityTypes[type] ?? type,
                    ALLOWED_PARENTS[type].map((p) => zhMeta.entityTypes[p] ?? p),
                  )}
                </FieldDescription>
              )}
            </Field>
          )}

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="h-note">{zhMeta.holders.note}</FieldLabel>
            <Input
              id="h-note"
              value={note}
              placeholder={zhMeta.holders.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      }
    />
  )
}
