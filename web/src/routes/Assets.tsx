import { InfoIcon, MoreVerticalIcon, SearchIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Outlet, useNavigate, useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type {
  Asset,
  AssetPage,
  BoundField,
  Category,
  CategorySchema,
  HolderEntity,
  User,
} from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { cn } from "cn"
import { t, tImport, tTransfer } from "@/i18n"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StateBoundary } from "@/components/StateBoundary"
import {
  BUILTIN_COLUMNS,
  useBuiltinColumns,
  useColumnSelection,
} from "@/features/assets/useColumns"
import { ActionBar } from "@/features/assets/ActionBar"
import { PrintDialog } from "@/features/print/PrintDialog"
import { usePrinting } from "@/features/print/usePrinting"
import { PageHeader } from "@/features/common/PageHeader"
import { PAGE_SIZES, Pager } from "@/features/common/Pager"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import {
  TransferDialog,
  transferActions,
  type TransferAction,
} from "@/features/transfers/TransferDialog"
import { usePermissions } from "@/features/auth/usePermissions"
import { ExportDialog } from "@/features/assets/ExportDialog"
import { NewAssetDialog } from "@/features/assets/NewAssetDialog"
import { TableFrame } from "@/features/common/TableFrame"
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const [categoryId, setCategoryId] = useState(searchParams.get("category_id") ?? "")
  const [includeDescendants, setIncludeDescendants] = useState(
    searchParams.get("include_descendants") !== "false",
  )
  const [status, setStatus] = useState(searchParams.get("status") ?? "")
  const [ownerId, setOwnerId] = useState(searchParams.get("owner_id") ?? "")
  const [holderId, setHolderId] = useState(searchParams.get("holder_id") ?? "")
  // Which model the list is looking at. In the address like every other filter
  // -- filter values are never persisted across sessions; only the choice of
  // columns is (015, decision 103). It is also what unlocks a model field's
  // column, since that column means nothing until the rows are devices that
  // have the field.
  const [modelId, setModelId] = useState(searchParams.get("model_id") ?? "")
  // Models belong to categories, so a model chosen under the old one cannot
  // survive the change -- keeping it would filter the list down to nothing.
  const previousCategory = useRef(categoryId)
  useEffect(() => {
    if (previousCategory.current !== categoryId) {
      previousCategory.current = categoryId
      setModelId("")
    }
  }, [categoryId])
  const { keys: chosenColumns, toggle } = useColumnSelection(categoryId)
  const { can, deniedReason } = usePermissions()
  // The built-ins are the same everywhere, so their selection is not per
  // category the way the field columns are.
  const builtins = useBuiltinColumns()
  const [selected, setSelected] = useState<string[]>([])
  // The row menu prints one device; the bar prints the ticked ones. Two states
  // because they are two acts, and a menu that printed the selection would be
  // a surprise for anyone who right-clicked a row they had not ticked.
  const [printingOne, setPrintingOne] = useState<string | null>(null)
  const { enabled: printing } = usePrinting()
  const [done, setDone] = useState<string | null>(null)
  const [page, setPage] = useState(() => {
    const n = Number(searchParams.get("page"))
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  // The overview's quick-entry card links here with a category already picked.
  const [creating, setCreating] = useState(searchParams.get("new") === "1")
  const [exporting, setExporting] = useState(false)
  const [pageSize, setPageSize] = useState(() => {
    const n = Number(searchParams.get("limit"))
    return PAGE_SIZES.includes(n) ? n : PAGE_SIZES[0]
  })
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
  if (modelId) params.set("model_id", modelId)
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

  // The filters live in the address, so opening a device and coming back finds
  // the list as it was. They used to be read from the address once and never
  // written to it, which meant every trip into a device threw them away and
  // the operator narrowed the list again by hand.
  //
  // Replaced rather than pushed: filtering is not a place you navigate to, and
  // pushing would make Back walk through every keystroke of the search box
  // instead of returning to the device you were just looking at.
  const address = (() => {
    const next = new URLSearchParams(params)
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

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })

  const categoryName = (id: string) =>
    (categories.data ?? []).find((c) => c.id === id)?.name ?? t.common.none

  // One query for the whole page rather than a lookup per row: the list shows
  // a model by name and by who makes it, and both live on the model.
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  // These lists answer in two shapes by design -- an array when asked plainly,
  // an envelope when asked with paging (decision 92) -- and this page asks
  // plainly. Normalising once means a cache entry filled by some other caller
  // cannot turn a filter into a crash.
  const modelList = Array.isArray(models.data) ? models.data : []
  const modelOf = (id: string | null) =>
    id === null ? undefined : modelList.find((m) => m.id === id)

  /** What one built-in column reads for one device. */
  const builtinCell = (key: (typeof BUILTIN_COLUMNS)[number], a: Asset) => {
    switch (key) {
      // Named, not the id: the list is read across categories whenever the
      // filter is off.
      case "category":
        return categoryName(a.category_id)
      case "status":
        return <StatusBadge status={a.status} />
      case "holder":
        return a.holder.name ?? t.common.none
      case "model":
        return modelOf(a.model_id)?.name ?? ""
      case "vendor":
        return modelOf(a.model_id)?.vendor ?? ""
      case "owner":
        return a.owner?.name ?? t.common.none
      case "note":
        return a.note
    }
  }

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
  // A model field's column says nothing until the rows are devices that have
  // the field, so it unlocks only while the model filter names one of its own
  // models (015, decision 103). Locked rather than hidden, and with the reason
  // on it: a control that vanishes leaves nobody anything to read.
  const unlocked = (f: BoundField) =>
    (f.model_ids ?? []).length === 0 || (modelId !== "" && f.model_ids!.includes(modelId))
  // Only what this category actually has, and only what applies right now.
  // The stored choice is per category already, but a field can be unbound
  // after it was chosen, the schema has not arrived yet on the first render
  // after a category change, and now the model filter can move out from under
  // a chosen column -- every one of those leaves a header with no field behind
  // it, which is a column of empty cells.
  const extraColumns = chosenColumns.filter((k) =>
    available.some((f) => f.key === k && unlocked(f)),
  )
  const total = assets.data?.total ?? 0

  return (
    <div className="grid gap-6">
      <PageHeader title={t.assets.title}>
        {/* Not a link: every credential this app has travels in a header, and
            a plain download navigation carries none of them. */}
        <Button
          variant="outline"
          onClick={() => setExporting(true)}
          disabled={deniedReason("export") !== undefined}
          title={deniedReason("export") ?? tImport.exportHint}
        >
          {tImport.export}
        </Button>
        <Button
          onClick={() => setCreating(true)}
          disabled={deniedReason("asset.create") !== undefined}
          title={deniedReason("asset.create")}
        >
          {t.assets.newAsset}
        </Button>
      </PageHeader>

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

        {/* Only within a category: models belong to categories, and a picker
            listing every model in the system would offer choices that cannot
            match the rows on screen. */}
        {categoryId && (
          <Field className="w-auto">
            <FieldLabel htmlFor="model" className="sr-only">
              {t.assets.modelFilter}
            </FieldLabel>
            <Select value={toNone(modelId)} onValueChange={(v) => setModelId(fromNone(v))}>
              <SelectTrigger id="model" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{t.assets.allModels}</SelectItem>
                  {modelList
                    .filter((m) => (m.category_ids ?? []).includes(categoryId))
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.vendor ? `${m.vendor} ${m.name}` : m.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}

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
        {/* Always here, not only once a category is chosen: the built-in
            columns exist on every device, so there is something to choose even
            under "all categories". */}
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
              {BUILTIN_COLUMNS.map((k) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={builtins.shows(k)}
                  // Kept open: choosing columns is a handful of decisions in a
                  // row, and closing after each one makes it four trips.
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => builtins.toggle(k)}
                >
                  {t.assets.columnLabels[k]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            {available.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t.assets.fieldColumns}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {available.map((f) => (
                    <DropdownMenuCheckboxItem
                      key={f.key}
                      checked={extraColumns.includes(f.key)}
                      disabled={!unlocked(f)}
                      title={unlocked(f) ? undefined : t.assets.modelColumnLocked}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => toggle(f.key)}
                    >
                      {f.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">{t.common.select}</span>
                  </TableHead>
                  {/* The number is not optional: it is what a row is read by
                      and what the click opens. */}
                  <TableHead>{t.assets.sn}</TableHead>
                  {BUILTIN_COLUMNS.filter(builtins.shows).map((k) => (
                    <TableHead key={k}>{t.assets.columnLabels[k]}</TableHead>
                  ))}
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
                        {BUILTIN_COLUMNS.filter(builtins.shows).map((k) => (
                          <TableCell
                            key={k}
                            // A note is a sentence: truncated, with the whole
                            // of it on hover, or one long one sets the width of
                            // every column beside it.
                            className={cn(
                              k === "note" && "text-muted-foreground max-w-48 truncate",
                            )}
                            title={k === "note" ? a.note : undefined}
                          >
                            {builtinCell(k, a)}
                          </TableCell>
                        ))}
                        {extraColumns.map((k) => (
                          <TableCell key={k}>{cellText(a.attrs[k])}</TableCell>
                        ))}
                      </TableRow>
                    </ContextMenuTrigger>
                    {/* The same actions the selection bar offers, reachable on
                        one device without ticking it first. */}
                    <ContextMenuContent>
                      {/* Reading before doing: the dialog a click opens shows
                          the last five movements, and this is the way to the
                          rest of them without opening it first. */}
                      <ContextMenuItem onSelect={() => navigate(`/assets/${a.id}/history`)}>
                        {t.assets.fullHistory}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      {transferActions().map(([action, label]) => (
                        <ContextMenuItem
                          key={action}
                          // Disabled rather than hidden: a colleague who cannot
                          // see the item has no way to learn it exists.
                          disabled={!can("transfer.create")}
                          onSelect={() => setRowTransfer({ id: a.id, action })}
                        >
                          {label}
                        </ContextMenuItem>
                      ))}
                      {/* One device, without ticking it first -- the same
                          reason every other action is on this menu. */}
                      {printing && (
                        <ContextMenuItem
                          disabled={!can("print")}
                          onSelect={() => setPrintingOne(a.id)}
                        >
                          {t.print.action}
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        disabled={!can("asset.delete")}
                        onSelect={() => setDeleting(a)}
                      >
                        {t.assets.delete}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </TableFrame>

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
        selected={selected}
      />

      <NewAssetDialog
        open={creating}
        onOpenChange={setCreating}
        initialCategoryID={searchParams.get("category_id") ?? undefined}
      />

      <ActionBar
        selected={selected}
        onClear={() => setSelected([])}
        onDone={setDone}
        onExport={() => setExporting(true)}
      />

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

      {/* /assets/:id renders here: one device, in a dialog over this list. */}
      <Outlet />
    </div>
  )
}
