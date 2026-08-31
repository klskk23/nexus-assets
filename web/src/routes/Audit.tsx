import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import { cn } from "@/lib/utils"
import { locale, tAudit } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { PAGE_SIZES, Pager } from "@/features/common/Pager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
  actor_id: string
  actor_name: string
  action: string
  target_type: string
  target_id: string
  target_label?: string
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
  const [targetID, setTargetID] = useState("")
  const [actorID, setActorID] = useState("")
  const [actorName, setActorName] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  // Which rows have their values open. A list rather than a single id: two
  // entries side by side is the reason anyone opens them at all.
  const [open, setOpen] = useState<number[]>([])

  const params = new URLSearchParams()
  if (targetType) params.set("target_type", targetType)
  if (targetID) params.set("target_id", targetID)
  if (actorID) params.set("actor_id", actorID)
  if (from) params.set("from", toRFC3339(from, false))
  if (to) params.set("to", toRFC3339(to, true))
  const filterKey = params.toString()

  // Narrowing the question sends you back to the first page. Page seven of a
  // different question is not a place anyone meant to be.
  useEffect(() => setPage(0), [filterKey, pageSize])

  const listParams = new URLSearchParams(filterKey)
  listParams.set("limit", String(pageSize))
  listParams.set("offset", String(page * pageSize))
  const listKey = listParams.toString()

  const query = useQuery({
    queryKey: ["audit", listKey],
    queryFn: () => api.get<Page>(`/audit?${listKey}`),
    // The table keeps its rows while the next page loads, so paging does not
    // blink the whole screen back to a skeleton.
    placeholderData: (prev) => prev,
  })

  const toggle = (id: number) =>
    setOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const narrowed = targetID !== "" || actorID !== ""
  const clear = () => {
    setTargetID("")
    setActorID("")
    setActorName("")
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold">{tAudit.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{tAudit.hint}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field>
          <FieldLabel htmlFor="au-type">{tAudit.targetType}</FieldLabel>
          <Select value={toNone(targetType)} onValueChange={(v) => setTargetType(fromNone(v))}>
            <SelectTrigger id="au-type" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{tAudit.allTypes}</SelectItem>
                {Object.entries(tAudit.targets).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="au-from">{tAudit.from}</FieldLabel>
          <Input id="au-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="au-to">{tAudit.to}</FieldLabel>
          <Input id="au-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      {/* The row menu can narrow to one object or one person, which is
          otherwise invisible -- so what it set says so, and can be undone. */}
      {narrowed && (
        <div className="flex flex-wrap items-center gap-2">
          {targetID && <Badge variant="outline">{tAudit.onlyTarget(targetID)}</Badge>}
          {actorID && <Badge variant="outline">{tAudit.onlyActor(actorName || actorID)}</Badge>}
          <Button variant="ghost" size="sm" onClick={clear}>
            {tAudit.clearFilters}
          </Button>
        </div>
      )}

      <StateBoundary
        isLoading={query.isLoading}
        error={query.error as Error | null}
        isEmpty={query.data?.items.length === 0}
        emptyTitle={tAudit.empty}
        emptyHint={tAudit.emptyHint}
        onRetry={() => query.refetch()}
      >
        <>
          <Pager
            page={page}
            pageSize={pageSize}
            total={query.data?.total ?? 0}
            onPage={setPage}
            onPageSize={setPageSize}
          />
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tAudit.when}</TableHead>
                  <TableHead>{tAudit.actor}</TableHead>
                  <TableHead>{tAudit.action}</TableHead>
                  <TableHead>{tAudit.target}</TableHead>
                  <TableHead>{tAudit.changes}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items ?? []).map((e) => {
                  const hasChange = e.before != null || e.after != null
                  const shown = open.includes(e.id)
                  return (
                    <ContextMenu key={e.id}>
                      <ContextMenuTrigger asChild>
                        {/* An audit entry cannot be edited or deleted -- it is
                            the record. So the row opens the values and the menu
                            narrows the question rather than acting on it. */}
                        <TableRow
                          data-state={shown ? "selected" : undefined}
                          className={cn(hasChange && "cursor-pointer")}
                          onClick={() => hasChange && toggle(e.id)}
                        >
                          <TableCell className="whitespace-nowrap">
                            {new Date(e.created_at).toLocaleString(locale())}
                          </TableCell>
                          <TableCell>{e.actor_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {tAudit.actions[e.action] ?? e.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {tAudit.targets[e.target_type] ?? e.target_type}
                            <span className="text-muted-foreground ml-2 text-xs">
                              {e.target_label ?? e.target_id}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {hasChange ? (shown ? tAudit.collapse : tAudit.expand) : tAudit.noChanges}
                          </TableCell>
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => setTargetType(e.target_type)}>
                          {tAudit.onlyThisType}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => setTargetID(e.target_id)}>
                          {tAudit.onlyThisTarget}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            setActorID(e.actor_id)
                            setActorName(e.actor_name)
                          }}
                        >
                          {tAudit.onlyThisActor}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem disabled={!hasChange} onSelect={() => toggle(e.id)}>
                          {shown ? tAudit.collapse : tAudit.expand}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* The opened values live under the table rather than inside a cell:
              a column wide enough for JSON is a column no other row needs. */}
          {(query.data?.items ?? [])
            .filter((e) => open.includes(e.id))
            .map((e) => (
              <div key={e.id} className="grid gap-2 rounded-md border p-3 text-xs">
                <p className="text-sm font-medium">
                  {new Date(e.created_at).toLocaleString(locale())} ·{" "}
                  {tAudit.actions[e.action] ?? e.action} ·{" "}
                  {tAudit.targets[e.target_type] ?? e.target_type} {e.target_label ?? e.target_id}
                </p>
                {e.before != null && (
                  <div>
                    <p className="text-muted-foreground">{tAudit.before}</p>
                    <pre className="bg-muted overflow-x-auto rounded p-2">
                      {JSON.stringify(e.before, null, 2)}
                    </pre>
                  </div>
                )}
                {e.after != null && (
                  <div>
                    <p className="text-muted-foreground">{tAudit.after}</p>
                    <pre className="bg-muted overflow-x-auto rounded p-2">
                      {JSON.stringify(e.after, null, 2)}
                    </pre>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => toggle(e.id)}
                >
                  {tAudit.collapse}
                </Button>
              </div>
            ))}
        </>
      </StateBoundary>
    </div>
  )
}
