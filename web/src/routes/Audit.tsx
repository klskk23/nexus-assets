import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import { zhAudit } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Entry {
  id: number
  actor_name: string
  action: string
  target_type: string
  target_id: string
  before?: unknown
  after?: unknown
  created_at: string
}

interface Page {
  items: Entry[]
  total: number
  offset: number
  limit: number
}

/** Turns a date input into the RFC3339 the API expects. */
function toRFC3339(day: string, endOfDay: boolean): string {
  if (!day) return ""
  return `${day}T${endOfDay ? "23:59:59" : "00:00:00"}Z`
}

export function Audit() {
  const [targetType, setTargetType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const params = new URLSearchParams()
  if (targetType) params.set("target_type", targetType)
  if (from) params.set("from", toRFC3339(from, false))
  if (to) params.set("to", toRFC3339(to, true))

  const query = useQuery({
    queryKey: ["audit", params.toString()],
    queryFn: () => api.get<Page>(`/audit?${params.toString()}`),
  })

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold">{zhAudit.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{zhAudit.hint}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field>
          <FieldLabel htmlFor="au-type">{zhAudit.targetType}</FieldLabel>
          <Select value={toNone(targetType)} onValueChange={(v) => setTargetType(fromNone(v))}>
            <SelectTrigger id="au-type" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{zhAudit.allTypes}</SelectItem>
                {Object.entries(zhAudit.targets).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="au-from">{zhAudit.from}</FieldLabel>
          <Input id="au-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="au-to">{zhAudit.to}</FieldLabel>
          <Input id="au-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <StateBoundary
        isLoading={query.isLoading}
        error={query.error as Error | null}
        isEmpty={query.data?.items.length === 0}
        emptyTitle={zhAudit.empty}
        emptyHint={zhAudit.emptyHint}
        onRetry={() => query.refetch()}
      >
        <>
          <p className="text-sm text-muted-foreground">{zhAudit.total(query.data?.total ?? 0)}</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{zhAudit.when}</TableHead>
                  <TableHead>{zhAudit.actor}</TableHead>
                  <TableHead>{zhAudit.action}</TableHead>
                  <TableHead>{zhAudit.target}</TableHead>
                  <TableHead>{zhAudit.changes}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>{e.actor_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {zhAudit.actions[e.action] ?? e.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{zhAudit.targets[e.target_type] ?? e.target_type}</TableCell>
                    <TableCell>
                      {Boolean(e.before ?? e.after) && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm">
                              {zhAudit.showChanges}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 grid gap-2 text-xs">
                              {e.before != null && (
                                <div>
                                  <p className="text-muted-foreground">{zhAudit.before}</p>
                                  <pre className="overflow-x-auto rounded bg-muted p-2">
                                    {JSON.stringify(e.before, null, 2) ?? ""}
                                  </pre>
                                </div>
                              )}
                              {e.after != null && (
                                <div>
                                  <p className="text-muted-foreground">{zhAudit.after}</p>
                                  <pre className="overflow-x-auto rounded bg-muted p-2">
                                    {JSON.stringify(e.after, null, 2) ?? ""}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      </StateBoundary>
    </div>
  )
}
