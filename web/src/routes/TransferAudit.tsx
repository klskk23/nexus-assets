import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { api } from "@/lib/api"
import type { User } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { NONE } from "@/lib/select"
import { t, tAudit, tTransfer } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { SearchSelect } from "@/features/common/SearchSelect"
import { PageHeader } from "@/features/common/PageHeader"
import { PAGE_SIZES, Pager } from "@/features/common/Pager"
import { TableFrame } from "@/features/common/TableFrame"
import { AuditTabs } from "@/features/audit/AuditTabs"
import { MovementCell } from "@/features/transfers/MovementCell"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

interface Page {
  items: Transfer[]
  total: number
}

/** The five things a person does to a device, plus the one the system does. */
const KINDS = ["create", "checkout", "checkin", "transfer", "reassign", "status_change"] as const

/**
 * Every movement in the system, which until now had no page.
 *
 * The operations audit beside it answers a different question -- who renamed a
 * field, who deleted a category -- from a different table. Movements are never
 * written to the audit log, so this is not a filtered view of that one; the two
 * are separate lists that happen to be read by the same kind of person, which
 * is why they share a tab bar and nothing else.
 *
 * Two routes rather than two tabs over one address: both lists filter and both
 * page, and two of those behind a single address trample each other's query
 * string (016, decision 107).
 */
export function TransferAudit() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [assetNumber, setAssetNumber] = useState(searchParams.get("asset_number") ?? "")
  const [actorID, setActorID] = useState(searchParams.get("actor_id") ?? "")
  const [kind, setKind] = useState(searchParams.get("kind") ?? "")
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

  const params = new URLSearchParams()
  if (assetNumber.trim()) params.set("asset_number", assetNumber.trim())
  if (actorID) params.set("actor_id", actorID)
  if (kind) params.set("kind", kind)
  if (range?.from) params.set("from", range.from.toISOString())
  if (range?.to) params.set("to", new Date(range.to.getTime() + 86_400_000).toISOString())
  params.set("offset", String(page * pageSize))
  params.set("limit", String(pageSize))

  // The filters live in the address, not only in memory: somebody who narrowed
  // to one person's week and then opened a device expects Back to return to
  // that week. replace rather than push, because a filter is not a place you
  // went -- push would make Back replay every keystroke.
  useEffect(() => {
    const next = new URLSearchParams(params)
    next.delete("offset")
    if (page > 0) next.set("page", String(page))
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetNumber, actorID, kind, range?.from, range?.to, page, pageSize])

  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") })
  const list = useQuery({
    queryKey: ["transfer-audit", params.toString()],
    queryFn: () => api.get<Page>(`/transfers?${params.toString()}`),
  })

  const filtered = Boolean(assetNumber.trim() || actorID || kind || range?.from)
  const clear = () => {
    setAssetNumber("")
    setActorID("")
    setKind("")
    setRange(undefined)
    setPage(0)
  }

  return (
    <div className="grid gap-14">
      {/* The tab strip rides the title row, where every other paired page in
          the product already puts it. On its own line it read as a second
          heading under the first, and pushed the filters and the table one
          band further down on a page whose whole job is the table. */}
      <PageHeader title={tAudit.movementsTitle} hint={tAudit.movementsHint}>
        <AuditTabs current="transfers" />
      </PageHeader>

      <div className="grid gap-[22px]">
        {/* One row of controls, labels read out only to screen readers: the
            placeholder and the value say what each one is, and a column of
            labels above a row of controls doubles the height of the bar for
            nothing. */}
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="ta-number" className="sr-only">
            {tAudit.assetNumber}
          </Label>
          <Input
            id="ta-number"
            className="w-[220px]"
            placeholder={tAudit.assetNumberPlaceholder}
            value={assetNumber}
            onChange={(e) => {
              setAssetNumber(e.target.value)
              setPage(0)
            }}
          />

          <Label htmlFor="ta-actor" className="sr-only">
            {tAudit.actor}
          </Label>
          {/* Searchable: accounts grow without bound, which is the judgement
              023 wrote down and then did not apply to the page it was creating
              in the same round. */}
          <SearchSelect
            id="ta-actor"
            className="w-[180px]"
            value={actorID}
            onChange={(v) => {
              setActorID(v)
              setPage(0)
            }}
            placeholder={tAudit.allActors}
            options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
          />

          <Label htmlFor="ta-kind" className="sr-only">
            {tAudit.kind}
          </Label>
          <Select
            value={kind || NONE}
            onValueChange={(v) => {
              setKind(v === NONE ? "" : v)
              setPage(0)
            }}
          >
            <SelectTrigger id="ta-kind" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{tAudit.allKinds}</SelectItem>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {tTransfer.kind[k] ?? k}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon />
                {range?.from ? range.from.toLocaleDateString() : tAudit.anyTime}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) => {
                  setRange(r)
                  setPage(0)
                }}
              />
            </PopoverContent>
          </Popover>

          {filtered && (
            <Button variant="ghost" size="sm" onClick={clear}>
              {tAudit.clearFilters}
            </Button>
          )}
        </div>

        <StateBoundary
          isLoading={list.isLoading}
          error={list.error as Error | null}
          isEmpty={list.data?.items.length === 0}
          emptyTitle={tAudit.movementsEmpty}
          emptyHint={filtered ? tAudit.movementsEmptyFiltered : undefined}
          onRetry={() => list.refetch()}
        >
          <TableFrame
            footer={
              <Pager
                page={page}
                pageSize={pageSize}
                total={list.data?.total ?? 0}
                onPage={setPage}
                onPageSize={(n) => {
                  setPageSize(n)
                  setPage(0)
                }}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tAudit.when}</TableHead>
                  <TableHead>{t.assets.title}</TableHead>
                  <TableHead>{tAudit.change}</TableHead>
                  <TableHead>{tAudit.actor}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data?.items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(it.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {/* The number, and a way to the device it names -- this
                          list is most often read to find out which one, and
                          then to go and look at it. */}
                      <Link
                        to={`/assets/${it.asset_id}`}
                        className="tabular-nums hover:text-primary"
                      >
                        {it.asset_display_name ?? it.asset_id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <MovementCell event={it} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {it.actor?.name ?? t.common.none}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </StateBoundary>
      </div>
    </div>
  )
}
