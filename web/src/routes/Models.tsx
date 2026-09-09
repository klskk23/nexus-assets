import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import type { ListPage } from "@/features/metadata/CrudPage"
import {
  AttrDefaultsEditor,
  toAttrDefaults,
  type DefaultRow,
} from "@/features/metadata/AttrDefaultsEditor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"

import { useParams, useSearchParams } from "react-router"

import { StateBoundary } from "@/components/StateBoundary"
import { PageHeader } from "@/features/common/PageHeader"
import { MasterDetail } from "@/features/common/MasterDetail"
import { useMasterSelection } from "@/features/common/useMasterSelection"
import { useFoldable } from "@/features/common/useFoldable"
import { Rail } from "@/features/common/Rail"
import { RailHeading, RailRow } from "@/features/common/RailRow"
import { TreePager } from "@/features/common/TreePager"
import { clampPage, pageCount, pageOfRoots } from "@/features/common/rootPaging"
import { modelTreeRows, searchModelRows } from "@/features/models/modelRows"
import { ModelDetail } from "@/features/models/ModelDetail"
import { VendorDetail } from "@/features/models/VendorDetail"
import { VendorEditor } from "@/features/models/VendorEditor"
import { VendorCreateDialog } from "@/features/models/VendorCreateDialog"
import { SearchSelect } from "@/features/common/SearchSelect"
import type { FieldDefinitionRow } from "@/lib/metaTypes"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

/** Vendors per page of the rail. A page is N vendors and all their models. */
const VENDORS_PER_PAGE = 8

/**
 * Models under the vendors they come from.
 *
 * They were two tabs, and a model belongs to exactly one vendor -- a real
 * one-to-many split across two tables that never showed the relationship. The
 * rail shows it: a vendor, then its models, and a heading for the white-box
 * ones that genuinely have no vendor.
 *
 * Nothing repeats here, unlike the fields rail. That is the whole difference
 * between the two pages despite them looking the same.
 */
export function Models() {
  const queryClient = useQueryClient()
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get("q") ?? ""
  const setSearch = (q: string) => {
    const next = new URLSearchParams(searchParams)
    if (q) next.set("q", q)
    else next.delete("q")
    setSearchParams(next, { replace: true })
  }
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<ProductModelRow | null>(null)
  const [editingVendor, setEditingVendor] = useState<VendorRow | null>(null)
  // A blank model stands in for "creating": the form is identical, and two
  // copies of it would drift the first time either was touched.
  const [creating, setCreating] = useState<ProductModelRow | null>(null)
  const [creatingVendor, setCreatingVendor] = useState(false)
  const { deniedReason } = usePermissions()
  const folds = useFoldable()

  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
  })
  const counts = useQuery({
    queryKey: ["model-counts"],
    queryFn: () => api.get<Record<string, number>>("/models/counts"),
  })
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const fields = useQuery({
    queryKey: ["fields", "all"],
    queryFn: () => api.get<ListPage<FieldDefinitionRow>>("/fields?limit=500"),
  })

  const modelList = Array.isArray(models.data) ? models.data : []
  const vendorList = Array.isArray(vendors.data) ? vendors.data : []
  const fieldList = fields.data?.items ?? []
  const countMap = counts.data ?? {}
  const searching = search.trim() !== ""

  const save = useMutation({
    mutationFn: (m: ProductModelRow) =>
      api.patch(`/models/${m.id}`, {
        name: m.name,
        vendor_id: m.vendor_id ?? "",
        note: m.note ?? "",
        category_ids: m.category_ids ?? [],
        attr_defaults: m.attr_defaults ?? {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] })
      queryClient.invalidateQueries({ queryKey: ["model-counts"] })
      setEditing(null)
    },
  })

  const add = useMutation({
    mutationFn: (m: ProductModelRow) =>
      api.post("/models", {
        category_ids: m.category_ids ?? [],
        name: m.name,
        vendor_id: m.vendor_id ?? "",
        note: m.note ?? "",
        attr_defaults: m.attr_defaults ?? {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] })
      queryClient.invalidateQueries({ queryKey: ["model-counts"] })
      setCreating(null)
    },
  })

  // Paged by vendor, so no model is ever shown without the vendor above it
  // (014 decision 91, in a rail instead of a table).
  const at = clampPage(page, vendorList.length, VENDORS_PER_PAGE)
  const rows = searching
    ? searchModelRows({ vendors: vendorList, models: modelList, counts: countMap }, search)
    : modelTreeRows({
        vendors: pageOfRoots(vendorList, at, VENDORS_PER_PAGE),
        models: modelList,
        counts: countMap,
        isFolded: folds.isFolded,
      })

  // Everything selectable, not just this page of the rail: the selection comes
  // from the address, and paging away from something does not stop it being
  // what you are reading.
  const selection = useMasterSelection(
    [...vendorList.map((v) => v.id), ...modelList.map((m) => m.id)],
    id,
  )
  const currentVendor = vendorList.find((v) => v.id === selection.current) ?? null
  const currentModel = modelList.find((m) => m.id === selection.current) ?? null
  const deniedModel = deniedReason("model.manage")

  return (
    <div>
      <PageHeader title={tMeta.models.title} hint={tMeta.models.categoryHint} />

      <div className="mt-14">
        <StateBoundary
          isLoading={models.isLoading || vendors.isLoading}
          error={(models.error ?? vendors.error) as Error | null}
          onRetry={() => {
            models.refetch()
            vendors.refetch()
          }}
        >
          <MasterDetail
            selected={Boolean(id)}
            list={
              <Rail
                searchID="mp-search"
                searchHint={tMeta.models.searchHint}
                search={search}
                onSearch={(q) => {
                  setSearch(q)
                  setPage(0)
                }}
                pager={
                  searching ? null : (
                    <TreePager
                      page={at}
                      pageCount={pageCount(vendorList.length, VENDORS_PER_PAGE)}
                      onPage={setPage}
                    />
                  )
                }
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground flex-1 rounded-full"
                      disabled={Boolean(deniedModel)}
                      title={deniedModel ?? undefined}
                      onClick={() =>
                        setCreating({
                          id: "",
                          name: "",
                          category_ids: [],
                          attr_defaults: {},
                        })
                      }
                    >
                      + {tMeta.models.create}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground flex-1 rounded-full"
                      disabled={Boolean(deniedModel)}
                      title={deniedModel ?? undefined}
                      onClick={() => setCreatingVendor(true)}
                    >
                      + {tMeta.vendors.create}
                    </Button>
                  </>
                }
              >
                {rows.map((r, i) =>
                  r.kind === "novendor" ? (
                    <li key="novendor">
                      <RailHeading>{tMeta.panes.noVendor}</RailHeading>
                    </li>
                  ) : (
                    <li key={`${r.kind}-${r.id}-${i}`}>
                      <RailRow
                        to={`/models/${r.id}`}
                        label={r.label}
                        count={r.count}
                        depth={r.depth}
                        selected={r.id === selection.current}
                        folded={
                          r.kind === "vendor" && !searching
                            ? folds.isFolded(r.id, r.count ?? 0)
                            : undefined
                        }
                        onFold={() => folds.toggle(r.id, r.count ?? 0)}
                        foldLabel={
                          folds.isFolded(r.id, r.count ?? 0) ? tMeta.panes.unfold : tMeta.panes.fold
                        }
                      />
                    </li>
                  ),
                )}
              </Rail>
            }
            detail={
              modelList.length === 0 && vendorList.length === 0 ? null : currentVendor ? (
                <VendorDetail
                  key={currentVendor.id}
                  vendor={currentVendor}
                  modelCount={modelList.filter((m) => m.vendor_id === currentVendor.id).length}
                  fields={fieldList}
                  onEdit={() => setEditingVendor(currentVendor)}
                />
              ) : currentModel ? (
                <ModelDetail
                  key={currentModel.id}
                  model={currentModel}
                  vendorName={currentModel.vendor_name ?? ""}
                  categories={categories.data ?? []}
                  fields={fieldList}
                  count={countMap[currentModel.id] ?? 0}
                  onEdit={() => setEditing(currentModel)}
                />
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {selection.missing ? tMeta.panes.notFound : tMeta.models.empty}
                    </EmptyTitle>
                    <EmptyDescription>
                      {selection.missing ? tMeta.panes.notFoundHint : tMeta.models.emptyHint}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            }
          />
        </StateBoundary>
      </div>

      <ModelEditor
        model={editing}
        categories={categories.data ?? []}
        vendors={vendorList}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(m) => save.mutate(m)}
        saving={save.isPending}
      />
      <ModelEditor
        model={creating}
        categories={categories.data ?? []}
        vendors={vendorList}
        onOpenChange={(open) => !open && setCreating(null)}
        onSave={(m) => add.mutate(m)}
        saving={add.isPending}
        title={tMeta.models.create}
      />
      {editingVendor && (
        <VendorEditor vendor={editingVendor} onClose={() => setEditingVendor(null)} />
      )}
      {creatingVendor && <VendorCreateDialog onClose={() => setCreatingVendor(false)} />}
    </div>
  )
}

interface EditProps {
  model: ProductModelRow | null
  categories: Category[]
  vendors: VendorRow[]
  onOpenChange: (open: boolean) => void
  onSave: (m: ProductModelRow) => void
  saving: boolean
  /** Creating rather than editing says so; the form itself is the same one. */
  title?: string
}

/** Edits one product model: its name, vendor, categories and defaults. */
function ModelEditor({
  model,
  categories,
  vendors,
  onOpenChange,
  onSave,
  saving,
  title,
}: EditProps) {
  const [draft, setDraft] = useState<ProductModelRow | null>(model)
  const [rows, setRows] = useState<DefaultRow[]>([])
  const [confirming, setConfirming] = useState(false)

  if (model?.id !== draft?.id) {
    setDraft(model)
    setRows(
      Object.entries(model?.attr_defaults ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    )
  }
  if (!draft) return null

  const ids = draft.category_ids ?? []
  const vendorChanged = (draft.vendor_id ?? "") !== (model?.vendor_id ?? "")

  return (
    <Dialog open={model !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? tMeta.models.editTitle}</DialogTitle>
        </DialogHeader>

        <FieldGroup className="sm:grid sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="me-name">{tMeta.models.name}</FieldLabel>
            <Input
              id="me-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="me-vendor">{tMeta.models.vendor}</FieldLabel>
            {/* Searchable: vendors grow without bound. */}
            <SearchSelect
              id="me-vendor"
              value={draft.vendor_id ?? ""}
              onChange={(v) => setDraft({ ...draft, vendor_id: v })}
              placeholder={tMeta.vendors.none}
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
            />
          </Field>

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="me-note">{tMeta.models.note}</FieldLabel>
            <Input
              id="me-note"
              value={draft.note ?? ""}
              placeholder={tMeta.models.notePlaceholder}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>

          <FieldSet className="sm:col-span-2">
            <FieldLegend variant="label">{tMeta.models.category}</FieldLegend>
            <FieldGroup className="flex flex-row flex-wrap items-center gap-4">
              {categories.map((c) => (
                <Field key={c.id} orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={`me-cat-${c.id}`}
                    checked={ids.includes(c.id)}
                    onCheckedChange={(v) =>
                      setDraft({
                        ...draft,
                        category_ids:
                          v === true ? [...ids, c.id] : ids.filter((id) => id !== c.id),
                      })
                    }
                  />
                  <FieldLabel htmlFor={`me-cat-${c.id}`}>{c.name}</FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>

          <div className="sm:col-span-2">
            <AttrDefaultsEditor rows={rows} onChange={setRows} />
          </div>
        </FieldGroup>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            disabled={draft.name === "" || saving}
            onClick={() => {
              // Changing the vendor takes away every field the old one
              // provided, on every device of this model at once. Mild -- the
              // values stay, read-only -- but not something to discover
              // afterwards, so the count comes first (decision 112).
              if (vendorChanged) setConfirming(true)
              else onSave({ ...draft, attr_defaults: toAttrDefaults(rows) })
            }}
          >
            {tMeta.models.save}
          </Button>
        </DialogFooter>
        <VendorChangeConfirm
          open={confirming}
          modelID={draft.id}
          vendorID={draft.vendor_id ?? ""}
          onOpenChange={setConfirming}
          onConfirm={() => {
            setConfirming(false)
            onSave({ ...draft, attr_defaults: toAttrDefaults(rows) })
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Says what changing a model's vendor costs, then lets it happen.
 *
 * The dry-run is asked while the dialog is open rather than on every keystroke
 * of the form, and a change that loses nothing goes straight through -- an
 * "are you sure" with nothing behind it teaches people to click past the ones
 * that matter.
 */
function VendorChangeConfirm({
  open,
  modelID,
  vendorID,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  modelID: string
  vendorID: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const impact = useQuery({
    queryKey: ["vendor-change-impact", modelID, vendorID],
    queryFn: () =>
      api.get<{ total: number; fields: string[] }>(
        `/models/${modelID}/vendor-change-impact?vendor_id=${encodeURIComponent(vendorID)}`,
      ),
    enabled: open,
  })
  const lost = impact.data?.fields ?? []

  useEffect(() => {
    if (open && impact.isSuccess && lost.length === 0) onConfirm()
  }, [open, impact.isSuccess, lost.length, onConfirm])

  if (lost.length === 0) return null
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tMeta.vendors.changeTitle}
      description={tMeta.vendors.changeHint(impact.data?.total ?? 0, lost.join("、"))}
      confirmLabel={tMeta.models.save}
      onConfirm={onConfirm}
    />
  )
}
