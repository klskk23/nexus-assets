import { CalendarIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import type { DateRange } from "react-day-picker"
import { enUS, zhCN } from "react-day-picker/locale"

import { api } from "@/lib/api"
import type { User } from "@/lib/types"
import { NONE, fromNone, toNone } from "@/lib/select"
import { cn } from "cn"
import { getLang, locale, tAudit } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { ListToolbar } from "@/features/common/ListToolbar"
import { PageHeader } from "@/features/common/PageHeader"
import { PAGE_SIZES, Pager } from "@/features/common/Pager"
import { TableFrame } from "@/features/common/TableFrame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

/**
 * Turns a picked day into the RFC3339 the API expects.
 *
 * The end of the range covers the whole day, or today's entries vanish the
 * moment someone filters "up to today".
 */
function toRFC3339(day: Date, endOfDay: boolean): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}Z`
}

function dayText(d: Date): string {
  return d.toLocaleDateString(locale())
}

export function Audit() {
  // The filters live in the address, so leaving this page and coming back
  // finds the same question rather than the whole log again. Same reason as
  // the asset list: a narrowing somebody built by hand should survive a trip
  // somewhere else.
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const [targetType, setTargetType] = useState(searchParams.get("target_type") ?? "")
  const [targetID, setTargetID] = useState(searchParams.get("target_id") ?? "")
  const [actorID, setActorID] = useState(searchParams.get("actor_id") ?? "")
  // The name the row menu came from, for an actor the account list no longer
  // has -- a deleted account still leaves its changes behind, which is the
  // point of an audit trail.
  const [actorName, setActorName] = useState(searchParams.get("actor_name") ?? "")
  const [action, setAction] = useState(searchParams.get("action") ?? "")
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = searchParams.get("from")
    if (!from) return undefined
    const to = searchParams.get("to")
    return { from: new Date(from), to: to ? new Date(to) : undefined }
  })
  const [page, setPage] = useState(() => {
    const n = Number(searchParams.get("page"))
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  const [pageSize, setPageSize] = useState(() => {
    const n = Number(searchParams.get("limit"))
    return PAGE_SIZES.includes(n) ? n : PAGE_SIZES[0]
  })
  // The entry whose values are on screen. A dialog rather than an expanded
  // row: JSON needs a width no other column wants, and the row underneath it
  // still has to be readable when you close it.
  const [detail, setDetail] = useState<Entry | null>(null)

  const params = new URLSearchParams()
  if (q.trim()) params.set("q", q.trim())
  if (targetType) params.set("target_type", targetType)
  if (targetID) params.set("target_id", targetID)
  if (actorID) params.set("actor_id", actorID)
  if (action) params.set("action", action)
  if (range?.from) params.set("from", toRFC3339(range.from, false))
  // One picked day is a range of one, not a range with no end.
  if (range?.from) params.set("to", toRFC3339(range.to ?? range.from, true))
  const filterKey = params.toString()

  // Narrowing the question sends you back to the first page. Page seven of a
  // different question is not a place anyone meant to be.
  useEffect(() => setPage(0), [filterKey, pageSize])

  // Replaced rather than pushed: narrowing a log is not a place you navigate
  // to, and Back should leave the page rather than undo one filter at a time.
  // actor_name rides along because a deleted account has no name to look up --
  // the row menu is where it came from, and the badge has to keep saying it.
  const address = (() => {
    const next = new URLSearchParams(params)
    if (actorName) next.set("actor_name", actorName)
    if (page > 0) next.set("page", String(page))
    if (pageSize !== PAGE_SIZES[0]) next.set("limit", String(pageSize))
    return next.toString()
  })()
  const current = searchParams.toString()
  useEffect(() => {
    if (address !== current) {
      setSearchParams(new URLSearchParams(address), { replace: true })
    }
  }, [address, current, setSearchParams])

  const listParams = new URLSearchParams(filterKey)
  listParams.set("limit", String(pageSize))
  listParams.set("offset", String(page * pageSize))
  const listKey = listParams.toString()

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  })

  const query = useQuery({
    queryKey: ["audit", listKey],
    queryFn: () => api.get<Page>(`/audit?${listKey}`),
    // The table keeps its rows while the next page loads, so paging does not
    // blink the whole screen back to a skeleton.
    placeholderData: (prev) => prev,
  })

  // Everything except the object filter has a control of its own; that one is
  // reachable only from a row menu, so it says so and can be undone.
  const knownActors = users.data ?? []
  const actorMissing = actorID !== "" && !knownActors.some((u) => u.id === actorID)

  const rangeText = !range?.from
    ? tAudit.anyDate
    : range.to && range.to.getTime() !== range.from.getTime()
      ? `${dayText(range.from)} – ${dayText(range.to)}`
      : dayText(range.from)

  const describe = (e: Entry) =>
    `${new Date(e.created_at).toLocaleString(locale())} · ${e.actor_name} · ` +
    `${tAudit.actions[e.action] ?? e.action} · ${tAudit.targets[e.target_type] ?? e.target_type} ` +
    `${e.target_label ?? e.target_id}`

  return (
    <div className="grid gap-6">
      <PageHeader title={tAudit.title} hint={tAudit.hint} />

      {/* One row, the same one every table page wears. Every control carries
          its own "all of them" wording, so the labels are for screen readers
          rather than a second tier of text. */}
      <ListToolbar
        q={q}
        onQ={setQ}
        searchHint={tAudit.searchHint}
        filters={
          <>
            <Field className="w-auto">
              <FieldLabel htmlFor="au-type" className="sr-only">
                {tAudit.targetType}
              </FieldLabel>
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

            <Field className="w-auto">
              <FieldLabel htmlFor="au-action" className="sr-only">
                {tAudit.action}
              </FieldLabel>
              <Select value={toNone(action)} onValueChange={(v) => setAction(fromNone(v))}>
                <SelectTrigger id="au-action" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NONE}>{tAudit.allActions}</SelectItem>
                    {Object.entries(tAudit.actions).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="w-auto">
              <FieldLabel htmlFor="au-actor" className="sr-only">
                {tAudit.actor}
              </FieldLabel>
              <Select value={toNone(actorID)} onValueChange={(v) => setActorID(fromNone(v))}>
                <SelectTrigger id="au-actor" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NONE}>{tAudit.allActors}</SelectItem>
                    {knownActors.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                    {actorMissing && (
                      <SelectItem value={actorID}>{actorName || actorID}</SelectItem>
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  aria-label={tAudit.dateRange}
                  className="justify-start font-normal"
                >
                  <CalendarIcon data-icon="inline-start" />
                  {rangeText}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  autoFocus
                  numberOfMonths={2}
                  // Reopening the picker lands on the range you chose, not on
                  // today -- otherwise a filter set last March is one month button
                  // at a time away from being read back.
                  defaultMonth={range?.from}
                  selected={range}
                  onSelect={setRange}
                  locale={getLang() === "zh" ? zhCN : enUS}
                />
                {range?.from && (
                  <div className="border-t p-2">
                    <Button variant="ghost" size="sm" onClick={() => setRange(undefined)}>
                      {tAudit.clearDates}
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {targetID && (
              <>
                <Badge variant="outline">{tAudit.onlyTarget(targetID)}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setTargetID("")}>
                  {tAudit.clearFilters}
                </Button>
              </>
            )}
          </>
        }
      />

      <StateBoundary
        isLoading={query.isLoading}
        error={query.error as Error | null}
        isEmpty={query.data?.items.length === 0}
        emptyTitle={tAudit.empty}
        emptyHint={tAudit.emptyHint}
        onRetry={() => query.refetch()}
      >
        <>
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tAudit.when}</TableHead>
                  <TableHead>{tAudit.actor}</TableHead>
                  <TableHead>{tAudit.action}</TableHead>
                  <TableHead>{tAudit.target}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items ?? []).map((e) => {
                  const hasChange = e.before != null || e.after != null
                  return (
                    <ContextMenu key={e.id}>
                      <ContextMenuTrigger asChild>
                        {/* An audit entry cannot be edited or deleted -- it is
                            the record. So the row opens the values and the menu
                            narrows the question rather than acting on it. */}
                        <TableRow
                          className={cn(hasChange && "cursor-pointer")}
                          onClick={() => hasChange && setDetail(e)}
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
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem disabled={!hasChange} onSelect={() => setDetail(e)}>
                          {tAudit.viewChanges}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
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
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>

          {/* Under the table, where you land after reading it -- and where the
              asset list keeps its own pager. */}
          <Pager
            page={page}
            pageSize={pageSize}
            total={query.data?.total ?? 0}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </>
      </StateBoundary>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tAudit.changeTitle}</DialogTitle>
            <DialogDescription>{detail ? describe(detail) : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto text-xs">
            {detail?.before != null && (
              <div>
                <p className="text-muted-foreground">{tAudit.before}</p>
                <pre className="bg-muted overflow-x-auto rounded p-2">
                  {JSON.stringify(detail.before, null, 2)}
                </pre>
              </div>
            )}
            {detail?.after != null && (
              <div>
                <p className="text-muted-foreground">{tAudit.after}</p>
                <pre className="bg-muted overflow-x-auto rounded p-2">
                  {JSON.stringify(detail.after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
