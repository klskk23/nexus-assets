import { InfoIcon, MoreVerticalIcon, SearchIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Asset, AssetPage, Category, CategorySchema, HolderEntity, User } from "@/lib/types"
import { t, tImport, tTransfer } from "@/i18n"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StateBoundary } from "@/components/StateBoundary"
import { useColumnSelection } from "@/features/assets/useColumns"
import { ActionBar } from "@/features/assets/ActionBar"
import { PrintDialog } from "@/features/print/PrintDialog"
import { usePrinting } from "@/features/print/usePrinting"
import { PAGE_SIZES, Pager } from "@/features/common/Pager"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import {
  TransferDialog,
  transferActions,
  type TransferAction,
} from "@/features/transfers/TransferDialog"
import { ExportDialog } from "@/features/assets/ExportDialog"
import { NewAssetDialog } from "@/features/assets/NewAssetDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

/** Offered page sizes. The first is the default. */
/**
 * The page numbers to draw: always the first and last, always the current and
 * its neighbours, an ellipsis for whatever is skipped. `null` marks a gap.
 *
 * A row of ten thousand buttons is not navigation, and neither is a bare
 * "next" -- somebody looking for the end of the list needs to be able to jump.
 */
/** Renders one custom attribute. Booleans read as words, not as true/false. */
function cellText(v: unknown): string {
  if (v === true) return t.common.yes
  if (v === false) return t.common.no
  return String(v ?? "")
}

export function Assets() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const { keys: chosenColumns, toggle } = useColumnSelection(categoryId)
  const [selected, setSelected] = useState<string[]>([])
  // The row menu prints one device; the bar prints the ticked ones. Two states
  // because they are two acts, and a menu that printed the selection would be
  // a surprise for anyone who right-clicked a row they had not ticked.
  const [printingOne, setPrintingOne] = useState<string | null>(null)
  const { enabled: printing } = usePrinting()
  const [done, setDone] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  // The overview's quick-entry card links here with a category already picked.
  const [creating, setCreating] = useState(searchParams.get("new") === "1")
  const [exporting, setExporting] = useState(false)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  // A context menu closes as it fires, so what it starts is parked here and
  // rendered outside the table.
  const [rowTransfer, setRowTransfer] = useState<{ id: string; action: TransferAction } | null>(
    null,
  )
  const [deleting, setDeleting] = useState<Asset | null>(null)

  const removeOne = useMutation({
    mutationFn: (a: Asset) =>
      api.del<void>(`/assets/${a.id}?confirm=${encodeURIComponent(a.display_name)}`),
    onSuccess: () => {
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: (e) => setDone(e instanceof ApiError ? e.message : t.common.error),
  })

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

  const categoryName = (id: string) =>
    (categories.data ?? []).find((c) => c.id === id)?.name ?? t.common.none

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
  // Only what this category actually has. The stored choice is per category
  // already, but a field can be unbound after it was chosen, and the schema
  // has not arrived yet on the first render after a category change -- either
  // way a header with no field behind it is a column of empty cells.
  const extraColumns = chosenColumns.filter((k) => available.some((f) => f.key === k))
  const total = assets.data?.total ?? 0

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">{t.assets.title}</h1>
        {/* Not a link: every credential this app has travels in a header, and
            a plain download navigation carries none of them. */}
        <Button variant="outline" onClick={() => setExporting(true)} title={tImport.exportHint}>
          {tImport.export}
        </Button>
        <Button onClick={() => setCreating(true)}>{t.assets.newAsset}</Button>
      </div>

      {/* One row. The labels are read out but not drawn: each control already
          shows what it is -- the magnifier, "全部类别", "全部状态" -- so drawing
          a caption above each one only pushed the filters onto three lines. */}
      <div className="flex flex-wrap items-center gap-2">
        <Field className="w-auto">
          <FieldLabel htmlFor="q" className="sr-only">
            {t.assets.search}
          </FieldLabel>
          <InputGroup className="w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="q"
              ref={searchRef}
              placeholder={t.assets.searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </InputGroup>
        </Field>

        <Field className="w-auto">
          <FieldLabel htmlFor="category" className="sr-only">
            {t.assets.category}
          </FieldLabel>
          <Select value={toNone(categoryId)} onValueChange={(v) => setCategoryId(fromNone(v))}>
            <SelectTrigger id="category" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{t.assets.allCategories}</SelectItem>
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
            {t.assets.statusLabel}
          </FieldLabel>
          <Select value={toNone(status)} onValueChange={(v) => setStatus(fromNone(v))}>
            <SelectTrigger id="status" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{t.assets.allStatuses}</SelectItem>
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
            {t.assets.owner}
          </FieldLabel>
          <Select value={toNone(ownerId)} onValueChange={(v) => setOwnerId(fromNone(v))}>
            <SelectTrigger id="owner" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{t.assets.allOwners}</SelectItem>
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
            {t.assets.holderFilter}
          </FieldLabel>
          <Select value={toNone(holderId)} onValueChange={(v) => setHolderId(fromNone(v))}>
            <SelectTrigger id="holder" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{t.assets.allHolders}</SelectItem>
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
            <FieldLabel htmlFor="descendants">{t.assets.includeDescendants}</FieldLabel>
          </Field>
        )}

        {/* The column picker used to be a bordered box of checkboxes standing
            between the filters and the table, as tall as it had fields. It is
            a menu on the table's own bar now: a category with twelve fields no
            longer pushes the rows off the screen. */}
        {available.length > 0 && (
          // Not modal: the point of ticking a column is watching it appear,
          // and a modal menu makes the table behind it inert and aria-hidden
          // while you choose.
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto" aria-label={t.assets.columns}>
                <MoreVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t.assets.columns}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {available.map((f) => (
                  <DropdownMenuCheckboxItem
                    key={f.key}
                    checked={extraColumns.includes(f.key)}
                    // Kept open: choosing columns is a handful of decisions in
                    // a row, and closing after each one makes it four trips.
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle(f.key)}
                  >
                    {f.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <StateBoundary
        isLoading={assets.isLoading}
        error={assets.error as Error | null}
        isEmpty={assets.data?.items.length === 0}
        emptyTitle={t.assets.empty}
        emptyHint={t.assets.emptyHint}
        onRetry={() => assets.refetch()}
      >
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">{t.common.select}</span>
                  </TableHead>
                  <TableHead>{t.assets.sn}</TableHead>
                  <TableHead>{t.assets.category}</TableHead>
                  <TableHead>{t.assets.statusLabel}</TableHead>
                  <TableHead>{t.assets.holder}</TableHead>
                  <TableHead>{t.assets.owner}</TableHead>
                  <TableHead>{t.assets.note}</TableHead>
                  {extraColumns.map((k) => (
                    <TableHead key={k}>{available.find((f) => f.key === k)?.label ?? k}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(assets.data?.items ?? []).map((a) => (
                  <ContextMenu key={a.id}>
                    <ContextMenuTrigger asChild>
                      {/* The whole row opens the device. It used to carry the
                          pointer cursor while only the number cell listened,
                          so four columns out of five looked clickable and
                          were not. */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => navigate(`/assets/${a.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label={t.common.selectOne(a.display_name)}
                            checked={selected.includes(a.id)}
                            onCheckedChange={() => toggleSelected(a.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono">{a.display_name}</TableCell>
                        {/* Named, not the id: the list is read across
                            categories whenever the filter is off. */}
                        <TableCell>{categoryName(a.category_id)}</TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                        <TableCell>{a.holder.name ?? t.common.none}</TableCell>
                        <TableCell>{a.owner?.name ?? t.common.none}</TableCell>
                        {/* Truncated with the whole of it on hover: a note is
                            a sentence, and one long one would set the width of
                            every column beside it. */}
                        <TableCell
                          className="text-muted-foreground max-w-48 truncate"
                          title={a.note}
                        >
                          {a.note}
                        </TableCell>
                        {extraColumns.map((k) => (
                          <TableCell key={k}>{cellText(a.attrs[k])}</TableCell>
                        ))}
                      </TableRow>
                    </ContextMenuTrigger>
                    {/* The same actions the selection bar offers, reachable on
                        one device without ticking it first. */}
                    <ContextMenuContent>
                      {transferActions().map(([action, label]) => (
                        <ContextMenuItem
                          key={action}
                          onSelect={() => setRowTransfer({ id: a.id, action })}
                        >
                          {label}
                        </ContextMenuItem>
                      ))}
                      {/* One device, without ticking it first -- the same
                          reason every other action is on this menu. */}
                      {printing && (
                        <ContextMenuItem onSelect={() => setPrintingOne(a.id)}>
                          {t.print.action}
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem variant="destructive" onSelect={() => setDeleting(a)}>
                        {t.assets.delete}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Under the table, where you land after reading it. */}
          <Pager
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </>
      </StateBoundary>

      {done && (
        <Alert role="status">
          <InfoIcon />
          <AlertDescription>{done}</AlertDescription>
        </Alert>
      )}

      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        params={params}
        categoryId={categoryId}
        includeDescendants={includeDescendants}
      />

      <NewAssetDialog
        open={creating}
        onOpenChange={setCreating}
        initialCategoryID={searchParams.get("category_id") ?? undefined}
      />

      <ActionBar selected={selected} onClear={() => setSelected([])} onDone={setDone} />

      {printingOne && <PrintDialog ids={[printingOne]} onClose={() => setPrintingOne(null)} />}

      {/* Driven by the context menu, which has already closed by the time
          either of these should appear. */}
      <TransferDialog
        assetIDs={rowTransfer ? [rowTransfer.id] : []}
        open={rowTransfer !== null}
        onOpenChange={(open) => !open && setRowTransfer(null)}
        initialAction={rowTransfer?.action ?? null}
        onDone={(n) => {
          setDone(tTransfer.actions.done(n))
          setRowTransfer(null)
        }}
      />

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={t.assets.deleteTitle}
          description={t.assets.deleteHint(deleting.display_name)}
          confirmLabel={t.assets.delete}
          requirePhrase={deleting.display_name}
          onConfirm={() => removeOne.mutate(deleting)}
        />
      )}
    </div>
  )
}
