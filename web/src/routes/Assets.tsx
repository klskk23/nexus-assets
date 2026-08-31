import { InfoIcon, SearchIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { AssetPage, Category, CategorySchema, HolderEntity, User } from "@/lib/types"
import { zh, zhImport } from "@/i18n/zh"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StateBoundary } from "@/components/StateBoundary"
import { useColumnSelection } from "@/features/assets/useColumns"
import { ActionBar } from "@/features/assets/ActionBar"
import { NewAssetDialog } from "@/features/assets/NewAssetDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
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

/** Offered page sizes. The first is the default. */
const PAGE_SIZES: number[] = [20, 50, 100]

/**
 * The page numbers to draw: always the first and last, always the current and
 * its neighbours, an ellipsis for whatever is skipped. `null` marks a gap.
 *
 * A row of ten thousand buttons is not navigation, and neither is a bare
 * "next" -- somebody looking for the end of the list needs to be able to jump.
 */
function pageWindow(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)

  const keep = new Set([0, count - 1, current, current - 1, current + 1])
  const out: (number | null)[] = []
  let gap = false
  for (let i = 0; i < count; i++) {
    if (keep.has(i)) {
      out.push(i)
      gap = false
    } else if (!gap) {
      out.push(null)
      gap = true
    }
  }
  return out
}

/** Renders one custom attribute. Booleans read as words, not as true/false. */
function cellText(v: unknown): string {
  if (v === true) return zh.common.yes
  if (v === false) return zh.common.no
  return String(v ?? "")
}

export function Assets() {
  const navigate = useNavigate()
  const statuses = useStatuses()
  const searchRef = useRef<HTMLInputElement>(null)

  // The overview links here with a filter already chosen, so the URL seeds the
  // initial state rather than the page opening blank and then jumping.
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [categoryId, setCategoryId] = useState(searchParams.get("category_id") ?? "")
  const [includeDescendants, setIncludeDescendants] = useState(
    searchParams.get("include_descendants") !== "false",
  )
  const [status, setStatus] = useState(searchParams.get("status") ?? "")
  const [ownerId, setOwnerId] = useState(searchParams.get("owner_id") ?? "")
  const [holderId, setHolderId] = useState(searchParams.get("holder_id") ?? "")
  const { keys: extraColumns, toggle } = useColumnSelection()
  const [selected, setSelected] = useState<string[]>([])
  const [done, setDone] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  // The overview's quick-entry card links here with a category already picked.
  const [creating, setCreating] = useState(searchParams.get("new") === "1")
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])

  const toggleSelected = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  // A barcode scanner types into whatever has focus. Without this the operator
  // has to click the box first, and "the scanner just works" stops being true.
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Export takes the filters and nothing else: a CSV of whichever page you
  // happened to be looking at would be a trap.
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (categoryId) {
    params.set("category_id", categoryId)
    params.set("include_descendants", String(includeDescendants))
  }
  if (status) params.set("status", status)
  if (ownerId) params.set("owner_id", ownerId)
  if (holderId) {
    // The kind travels with the id: the server filters on the pair, and an id
    // without one would match a user and an entity that happened to share it.
    params.set("holder_type", "entity")
    params.set("holder_id", holderId)
  }

  const listParams = new URLSearchParams(params)
  listParams.set("limit", String(pageSize))
  listParams.set("offset", String(page * pageSize))

  // Any change to what is being asked for puts you back on the first page --
  // page 7 of a different question is not a place anyone meant to be.
  const filterKey = params.toString()
  useEffect(() => {
    setPage(0)
  }, [filterKey, pageSize])

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
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

  const assets = useQuery({
    queryKey: ["assets", listParams.toString()],
    queryFn: () => api.get<AssetPage>(`/assets?${listParams.toString()}`),
    placeholderData: (prev) => prev,
  })

  // A unique exact hit means the operator scanned a specific device.
  useEffect(() => {
    if (assets.data?.exact_match_id) {
      navigate(`/assets/${assets.data.exact_match_id}`)
    }
  }, [assets.data?.exact_match_id, navigate])

  const available = schema.data?.fields?.filter((f) => f.type !== "computed") ?? []
  const total = assets.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">{zh.assets.title}</h1>
        <Button variant="outline" asChild>
          <a href={`/api/export.csv?${params.toString()}`} download title={zhImport.exportHint}>
            {zhImport.export}
          </a>
        </Button>
        <Button onClick={() => setCreating(true)}>{zh.assets.newAsset}</Button>
      </div>

      {/* One row. The labels are read out but not drawn: each control already
          shows what it is -- the magnifier, "全部类别", "全部状态" -- so drawing
          a caption above each one only pushed the filters onto three lines. */}
      <div className="flex flex-wrap items-center gap-2">
        <Field className="w-auto">
          <FieldLabel htmlFor="q" className="sr-only">
            {zh.assets.search}
          </FieldLabel>
          <InputGroup className="w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="q"
              ref={searchRef}
              placeholder={zh.assets.searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </InputGroup>
        </Field>

        <Field className="w-auto">
          <FieldLabel htmlFor="category" className="sr-only">
            {zh.assets.category}
          </FieldLabel>
          <Select value={toNone(categoryId)} onValueChange={(v) => setCategoryId(fromNone(v))}>
            <SelectTrigger id="category" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{zh.assets.allCategories}</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className="w-auto">
          <FieldLabel htmlFor="status" className="sr-only">
            {zh.assets.statusLabel}
          </FieldLabel>
          <Select value={toNone(status)} onValueChange={(v) => setStatus(fromNone(v))}>
            <SelectTrigger id="status" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{zh.assets.allStatuses}</SelectItem>
                {statuses.statuses.map(({ key: k, label: v }) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className="w-auto">
          <FieldLabel htmlFor="owner" className="sr-only">
            {zh.assets.owner}
          </FieldLabel>
          <Select value={toNone(ownerId)} onValueChange={(v) => setOwnerId(fromNone(v))}>
            <SelectTrigger id="owner" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{zh.assets.allOwners}</SelectItem>
                {(users.data ?? [])
                  .filter((u) => u.status === "active")
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className="w-auto">
          <FieldLabel htmlFor="holder" className="sr-only">
            {zh.assets.holderFilter}
          </FieldLabel>
          <Select value={toNone(holderId)} onValueChange={(v) => setHolderId(fromNone(v))}>
            <SelectTrigger id="holder" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{zh.assets.allHolders}</SelectItem>
                {(holders.data ?? []).map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        {categoryId && (
          <Field orientation="horizontal" className="w-auto">
            <Checkbox
              id="descendants"
              checked={includeDescendants}
              onCheckedChange={(v) => setIncludeDescendants(v === true)}
            />
            <FieldLabel htmlFor="descendants">{zh.assets.includeDescendants}</FieldLabel>
          </Field>
        )}
      </div>

      {available.length > 0 && (
        <FieldSet className="rounded-md border p-3">
          <FieldLegend variant="label">{zh.assets.columns}</FieldLegend>
          <FieldGroup className="flex flex-row flex-wrap items-center gap-4">
            {available.map((f) => (
              <Field key={f.key} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`col-${f.key}`}
                  checked={extraColumns.includes(f.key)}
                  onCheckedChange={() => toggle(f.key)}
                />
                <FieldLabel htmlFor={`col-${f.key}`}>{f.label}</FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      )}

      <StateBoundary
        isLoading={assets.isLoading}
        error={assets.error as Error | null}
        isEmpty={assets.data?.items.length === 0}
        emptyTitle={zh.assets.empty}
        emptyHint={zh.assets.emptyHint}
        onRetry={() => assets.refetch()}
      >
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {zh.assets.rangeOf(
                total === 0 ? 0 : page * pageSize + 1,
                Math.min((page + 1) * pageSize, total),
                total,
              )}
            </p>
            <Field orientation="horizontal" className="ml-auto w-auto">
              <FieldLabel htmlFor="page-size" className="text-sm text-muted-foreground">
                {zh.assets.perPage}
              </FieldLabel>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v))}
              >
                <SelectTrigger id="page-size" size="sm" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PAGE_SIZES.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {zh.assets.perPageUnit(n)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">{zh.common.select}</span>
                  </TableHead>
                  <TableHead>{zh.assets.sn}</TableHead>
                  <TableHead>{zh.assets.statusLabel}</TableHead>
                  <TableHead>{zh.assets.holder}</TableHead>
                  <TableHead>{zh.assets.owner}</TableHead>
                  {extraColumns.map((k) => (
                    <TableHead key={k}>{available.find((f) => f.key === k)?.label ?? k}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(assets.data?.items ?? []).map((a) => (
                  <TableRow key={a.id} className="cursor-pointer">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={zh.common.selectOne(a.display_name)}
                        checked={selected.includes(a.id)}
                        onCheckedChange={() => toggleSelected(a.id)}
                      />
                    </TableCell>
                    <TableCell
                      className="font-mono"
                      onClick={() => navigate(`/assets/${a.id}`)}
                    >
                      {a.display_name}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>{a.holder.name ?? zh.common.none}</TableCell>
                    <TableCell>{a.owner?.name ?? zh.common.none}</TableCell>
                    {extraColumns.map((k) => (
                      <TableCell key={k}>{cellText(a.attrs[k])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-label={zh.assets.prevPage}
                    aria-disabled={page === 0}
                    className={cn(page === 0 && "pointer-events-none opacity-50")}
                    onClick={(e) => {
                      e.preventDefault()
                      setPage((p) => Math.max(0, p - 1))
                    }}
                  />
                </PaginationItem>
                {pageWindow(page, pageCount).map((n, i) =>
                  n === null ? (
                    <PaginationItem key={`gap-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={n}>
                      <PaginationLink
                        href="#"
                        isActive={n === page}
                        onClick={(e) => {
                          e.preventDefault()
                          setPage(n)
                        }}
                      >
                        {n + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-label={zh.assets.nextPage}
                    aria-disabled={page >= pageCount - 1}
                    className={cn(page >= pageCount - 1 && "pointer-events-none opacity-50")}
                    onClick={(e) => {
                      e.preventDefault()
                      setPage((p) => Math.min(pageCount - 1, p + 1))
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      </StateBoundary>

      {done && (
        <Alert role="status">
          <InfoIcon />
          <AlertDescription>{done}</AlertDescription>
        </Alert>
      )}

      <NewAssetDialog
        open={creating}
        onOpenChange={setCreating}
        initialCategoryID={searchParams.get("category_id") ?? undefined}
      />

      <ActionBar
        selected={selected}
        onClear={() => setSelected([])}
        onDone={setDone}
      />
    </div>
  )
}
