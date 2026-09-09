import { ArrowRightLeftIcon, InfoIcon, MoreVerticalIcon, PrinterIcon, SearchIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
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
import type { FieldDefinitionRow, ProductModelRow, VendorRow } from "@/lib/metaTypes"
import type { ListPage } from "@/features/metadata/CrudPage"
import { modelLabel } from "@/lib/metaTypes"
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
import { SearchSelect } from "@/features/common/SearchSelect"
import { FOLD_ABOVE } from "@/features/common/useFoldable"
import { TableFrame } from "@/features/common/TableFrame"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useSelection } from "@/features/assets/useSelection"
import { SelectAllBanner } from "@/features/assets/SelectAllBanner"
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
  DropdownMenuItem,
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
  // Not in the address: how much of a menu is open is a posture in one
  // visit, not a place to share. Same judgement 025 made about folding.
  const [showAllFields, setShowAllFields] = useState(false)
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
  // The whole fleet from one supplier, which used to mean picking their models
  // off the list one at a time (016). Not narrowed by category: "every Dell we
  // own" is a question about the supplier, not about a branch of the tree.
  const [vendorId, setVendorId] = useState(searchParams.get("vendor_id") ?? "")
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
  const selection = useSelection()
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
  if (vendorId) params.set("vendor_id", vendorId)
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
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
  })
  const vendorList = Array.isArray(vendors.data) ? vendors.data : []
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
        return modelOf(a.model_id)?.vendor_name ?? ""
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
  // Without a category there is still a column menu to fill. It used to be
  // empty, because the only source of fields was a category's schema and that
  // query did not even run -- so "show me every Dell device and its firmware
  // version" had no way to be asked. The whole library instead; the unlock
  // rule below is what keeps a model's field from becoming a column of blanks.
  const library = useQuery({
    queryKey: ["fields", "all"],
    queryFn: () => api.get<ListPage<FieldDefinitionRow>>("/fields?limit=500"),
  })

  const assets = useQuery({
    queryKey: ["assets", listParams.toString()],
    queryFn: () => api.get<AssetPage>(`/assets?${listParams.toString()}`),
    placeholderData: (prev) => prev,
  })

  // A unique exact hit means the operator scanned a specific device.
  // In display order: the range gesture counts rows as they are seen, and the
  // header checkbox means "this page", not "everything loaded".
  const pageIds = (assets.data?.items ?? []).map((a) => a.id)
  useEffect(() => {
    if (assets.data?.exact_match_id) {
      navigate(`/assets/${assets.data.exact_match_id}`)
    }
  }, [assets.data?.exact_match_id, navigate])

  // The category's own fields plus every device-side field there is.
  //
  // A category's schema stopped carrying its models' fields in 026, so taking
  // the pool from it alone would have quietly removed those columns the moment
  // a category was picked -- the opposite of what this round was for. The
  // device-side half comes from the library, where a row already says which
  // models and vendors it is bound to, and the unlock rule below is what keeps
  // it from becoming a column of blanks.
  const deviceFields = ((library.data?.items ?? []) as unknown as BoundField[]).filter(
    (f) => (f.model_ids ?? []).length > 0 || (f.vendor_ids ?? []).length > 0,
  )
  const available = (
    categoryId !== ""
      ? [...(schema.data?.fields ?? []), ...deviceFields]
      : ((library.data?.items ?? []) as unknown as BoundField[])
  ).filter((f) => f.type !== "computed")
  // A device field's column says nothing until the rows are devices that have
  // the field, so it unlocks only once a filter has narrowed to those (015,
  // decision 103). Locked rather than hidden, and with the reason on it: a
  // control that vanishes leaves nobody anything to read.
  //
  // The vendor filter narrows just as well as the model filter, and until 016
  // there was nothing else to narrow by. A field bound to Dell was reachable
  // only by picking one Dell model at a time -- with the vendor chosen, every
  // row on screen is one of its devices, which is exactly the condition this
  // rule is about.
  // The fields the chosen category's chain carries. Empty with no category,
  // which is the point: without one, the rows come from everywhere.
  const chainKeys = new Set((schema.data?.fields ?? []).map((f) => f.key))

  const unlocked = (f: BoundField) => {
    const models = f.model_ids ?? []
    if (models.length === 0) {
      // A category-bound field belongs to some categories, not all -- so it
      // unlocks on the same terms a model-bound one does: once the list is
      // narrowed to rows that have it.
      //
      // This used to be an unconditional yes, and was right while the pool of
      // fields came from the chosen category's own schema: everything in it
      // was on that chain by construction. 026 made the pool the whole library
      // so that a vendor filter alone could offer its columns, and left this
      // line standing on an invariant that had gone -- which put every
      // category's fields on offer over a list of every category's devices.
      return categoryId !== "" && chainKeys.has(f.key)
    }
    if (modelId !== "") return models.includes(modelId)
    if (vendorId === "") return false
    // Bound to this vendor: every row the filter leaves has the field. Or
    // bound to one of its models directly, which is still a row on screen.
    return (
      (f.vendor_ids ?? []).includes(vendorId) ||
      models.some((id) => modelList.find((m) => m.id === id)?.vendor_id === vendorId)
    )
  }
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
    <div>
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

      {/* The list is one thing seen in three parts: the controls that narrow
          it, the rows, and the pager under them. */}
      <div className="mt-14 grid gap-[22px]">
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
            {/* The row leads with the name and searches the path too: a
                category's own name is short and repeats across the tree, and
                what people remember is where it sits. */}
            <SearchSelect
              id="category"
              className="w-44"
              value={categoryId}
              onChange={setCategoryId}
              placeholder={t.assets.allCategories}
              options={(categories.data ?? []).map((c) => ({
                value: c.id,
                label: c.name,
                keywords: c.path,
              }))}
            />
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
            <SearchSelect
              id="owner"
              className="w-40"
              value={ownerId}
              onChange={setOwnerId}
              placeholder={t.assets.allOwners}
              options={(users.data ?? [])
                .filter((u) => u.status === "active")
                .map((u) => ({ value: u.id, label: u.name }))}
            />
          </Field>

          <Field className="w-auto">
            <FieldLabel htmlFor="holder" className="sr-only">
              {t.assets.holderFilter}
            </FieldLabel>
            <SearchSelect
              id="holder"
              className="w-40"
              value={holderId}
              onChange={setHolderId}
              placeholder={t.assets.allHolders}
              options={(holders.data ?? []).map((h) => ({ value: h.id, label: h.name }))}
            />
          </Field>

          <Field className="w-auto">
            <FieldLabel htmlFor="vendor" className="sr-only">
              {t.assets.vendorFilter}
            </FieldLabel>
            <SearchSelect
              id="vendor"
              className="w-40"
              value={vendorId}
              onChange={setVendorId}
              placeholder={t.assets.allVendors}
              options={vendorList.map((v) => ({ value: v.id, label: v.name }))}
            />
          </Field>

          {/* No longer inside a category. A model belonged to categories once,
              so a picker outside one would have offered choices that could not
              match the rows; 026 severed that, and "which Dell laptops do we
              have" stopped needing a category picked first.
              The vendor narrows it instead -- one direction only, because a
              control that fills itself in when you touch another one is a
              control that changed without being asked. */}
          <Field className="w-auto">
              <FieldLabel htmlFor="model" className="sr-only">
                {t.assets.modelFilter}
              </FieldLabel>
              <SearchSelect
                id="model"
                className="w-44"
                value={modelId}
                onChange={setModelId}
                placeholder={t.assets.allModels}
                options={modelList
                  .filter((m) => vendorId === "" || m.vendor_id === vendorId)
                  .map((m) => ({
                    value: m.id,
                    label: modelLabel(m),
                    // Model names carry part numbers, and people search by the
                    // maker as often as by the number.
                    keywords: m.vendor_name,
                  }))}
              />
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
                    {/* Long lists fold. The library grows without bound and
                        this menu is read by scanning it, which stops working
                        somewhere around the point where it fills its own
                        height. Same threshold and the same argument as the
                        rails in 025 -- and the same condition on it: the row
                        that opens the rest says how many are behind it, so
                        nobody is left guessing whether their field is missing
                        or merely hidden. */}
                    {(showAllFields ? available : available.slice(0, FOLD_ABOVE)).map((f) => (
                      <DropdownMenuCheckboxItem
                        key={f.key}
                        checked={extraColumns.includes(f.key)}
                        disabled={!unlocked(f)}
                        title={
                          unlocked(f)
                            ? undefined
                            : (f.model_ids ?? []).length > 0
                              ? t.assets.modelColumnLocked
                              : t.assets.categoryColumnLocked
                        }
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => toggle(f.key)}
                      >
                        {f.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {!showAllFields && available.length > FOLD_ABOVE && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          setShowAllFields(true)
                        }}
                      >
                        {t.assets.showAllColumns(available.length)}
                      </DropdownMenuItem>
                    )}
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
            <TableFrame
              footer={
                <Pager
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPage={setPage}
                  onPageSize={setPageSize}
                />
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="bg-well sticky left-0 z-[2] w-10">
                      <Checkbox
                        aria-label={t.assets.selectPage}
                        checked={
                          selection.pageAllSelected(pageIds)
                            ? true
                            : selection.pageSomeSelected(pageIds)
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={() => selection.togglePage(pageIds)}
                      />
                    </TableHead>
                    {/* The number is not optional: it is what a row is read by
                        and what the click opens -- so it is pinned beside the
                        checkbox rather than allowed to scroll away, and the two
                        of them carry the shadow that says the rest slides
                        underneath. */}
                    <TableHead className="bg-well sticky left-10 z-[2] shadow-[14px_0_14px_-14px_rgba(32,30,29,.22)]">
                      {t.assets.sn}
                    </TableHead>
                    {BUILTIN_COLUMNS.filter(builtins.shows).map((k) => (
                      <TableHead key={k}>{t.assets.columnLabels[k]}</TableHead>
                    ))}
                    {extraColumns.map((k) => (
                      <TableHead key={k}>{available.find((f) => f.key === k)?.label ?? k}</TableHead>
                    ))}
                    {/* The row actions. No heading text: three icon buttons that
                        appear on hover are not a column of data, and a label over
                        them would claim they are. */}
                    <TableHead className="bg-well sticky right-0 z-[2] w-px shadow-[-14px_0_14px_-14px_rgba(32,30,29,.22)]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(assets.data?.items ?? []).map((a, i) => (
                    <ContextMenu key={a.id}>
                      {/* No row menu while a selection stands. The menu acts
                          on this one device and the bar below acts on the N
                          that are ticked, and one right-click cannot mean
                          both -- right-clicking a ticked row and getting an
                          action for only that row is the kind of thing you
                          find out about afterwards. The bar is on screen and
                          carries the same four verbs. */}
                      <ContextMenuTrigger asChild disabled={selection.ids.length > 0}>
                        {/* The whole row opens the device. It used to carry the
                            pointer cursor while only the number cell listened,
                            so four columns out of five looked clickable and
                            were not. */}
                        <TableRow
                          className="group/row cursor-pointer"
                          onClick={() => navigate({ pathname: `/assets/${a.id}`, search: searchParams.toString() })}
                        >
                          <TableCell
                            className="bg-well group-hover/row:bg-accent sticky left-0 z-[1]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              aria-label={t.common.selectOne(a.display_name)}
                              checked={selection.has(a.id)}
                              // The modifier has to be read here rather than from
                              // the cell: onCheckedChange carries no event, and a
                              // handler on the parent runs after Radix has already
                              // toggled, so the range and the tick cancel out.
                              // Radix composes this before its own and skips that
                              // one when the default is prevented, which is what
                              // keeps a Shift-click from also toggling the row.
                              onClick={(e) => {
                                if (!e.shiftKey) return
                                e.preventDefault()
                                selection.extendTo(a.id, i, pageIds)
                              }}
                              onCheckedChange={() => selection.toggle(a.id, i)}
                            />
                          </TableCell>
                          <TableCell className="bg-well group-hover/row:bg-accent sticky left-10 z-[1] font-mono shadow-[14px_0_14px_-14px_rgba(32,30,29,.22)]">
                            {a.display_name}
                          </TableCell>
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
                          {/* One device, no ticking first. The developer's own
                              complaint was the number of clicks a single device
                              cost, and ticking it only to untick it afterwards
                              was two of them.

                              stopPropagation on every one: these sit inside the
                              row's own click target, and without it a print would
                              also open the device behind the dialog. Each carries
                              an aria-label -- an icon button with no accessible
                              name is a button a keyboard user cannot identify.
                              Visible on hover and on focus, so tabbing through
                              reaches something that can be seen. */}
                          <TableCell
                            className="bg-well group-hover/row:bg-accent sticky right-0 z-[1] w-px shadow-[-14px_0_14px_-14px_rgba(32,30,29,.22)]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                              {printing && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t.assets.rowPrint}
                                  disabled={!can("print")}
                                  onClick={() => setPrintingOne(a.id)}
                                >
                                  <PrinterIcon />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t.assets.rowTransfer}
                                disabled={!can("transfer.create")}
                                onClick={() => setRowTransfer({ id: a.id, action: "checkout" })}
                              >
                                <ArrowRightLeftIcon />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t.assets.rowDetail}
                                onClick={() => navigate({ pathname: `/assets/${a.id}`, search: searchParams.toString() })}
                              >
                                <InfoIcon />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      </ContextMenuTrigger>
                      {/* The same actions the selection bar offers, reachable on
                          one device without ticking it first. */}
                      <ContextMenuContent>
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

            {/* Only once the whole page is ticked. Twenty rows out of six hundred
                is a deliberate act that needs no offer; a full page is the gesture
                that usually means "and the rest as well". */}
            {selection.pageAllSelected(pageIds) && (
              <SelectAllBanner
                params={params}
                total={assets.data?.total ?? 0}
                selectedCount={selection.ids.length}
                onSelectAll={selection.add}
              />
            )}

          </>
        </StateBoundary>
      </div>

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
        selected={selection.ids}
      />

      <NewAssetDialog
        open={creating}
        onOpenChange={setCreating}
        initialCategoryID={searchParams.get("category_id") ?? undefined}
      />

      <ActionBar
        selected={selection.ids}
        onClear={selection.clear}
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
          tone="danger"
          requirePhrase={deleting.display_name}
          onConfirm={() => removeOne.mutate(deleting)}
        />
      )}

      {/* /assets/:id renders here: one device, in a dialog over this list. */}
    </div>
  )
}
