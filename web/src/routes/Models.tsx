import { AlertCircleIcon } from "lucide-react"
import { Hint } from "@/features/common/Hint"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import { CategoryFilter } from "@/features/common/CategoryFilter"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import {
  AttrDefaultsEditor,
  toAttrDefaults,
  type DefaultRow,
} from "@/features/metadata/AttrDefaultsEditor"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NONE, fromNone, toNone } from "@/lib/select"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { MetadataTabs } from "@/features/metadata/MetadataTabs"

export function Models() {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [editing, setEditing] = useState<ProductModelRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [defaults, setDefaults] = useState<DefaultRow[]>([])

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
  })
  const vendorList = Array.isArray(vendors.data) ? vendors.data : []
  const byId = new Map((categories.data ?? []).map((c) => [c.id, c.name]))

  const invalidate = () => {
    setNotice(null)
    queryClient.invalidateQueries({ queryKey: ["models"] })
  }
  const fail = (e: unknown) => setNotice(e instanceof ApiError ? e.message : t.common.error)

  const save = useMutation({
    mutationFn: (m: ProductModelRow) =>
      api.patch(`/models/${m.id}`, {
        name: m.name,
        vendor_id: m.vendor_id ?? "",
        category_ids: m.category_ids ?? [],
        attr_defaults: m.attr_defaults ?? {},
      }),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/models/${id}`),
    onSuccess: invalidate,
    onError: fail,
  })

  return (
    <>
    <CrudPage<ProductModelRow>
      title={tMeta.models.title}
      queryKey="models"
      searchHint={tMeta.models.searchHint}
      toolbarActions={<MetadataTabs current="models" />}
      filterKeys={{ category_id: "" }}
      filters={(q) => (
        <CategoryFilter
          value={q.filters.category_id}
          onChange={(v) => q.setFilter("category_id", v)}
        />
      )}
      list={(params) => api.get<ListPage<ProductModelRow>>(`/models?${params}`)}
      createLabel={tMeta.models.create}
      createDeniedReason={deniedReason("model.manage")}
      createDisabled={name === ""}
      onCreated={() => {
        setName("")
        setVendorId("")
        setCategoryIds([])
        setDefaults([])
      }}
      create={() =>
        api.post("/models", {
          category_ids: categoryIds,
          name,
          vendor_id: vendorId,
          attr_defaults: toAttrDefaults(defaults),
        })
      }
      notice={
        notice && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )
      }
      onRowClick={(m) => setEditing(m)}
      rowActions={[
        { label: tMeta.models.edit, onSelect: (m) => setEditing(m) },
        {
          label: tMeta.models.delete,
          destructive: true,
          onSelect: (m) => remove.mutate(m.id),
          confirm: (m) => ({
            title: tMeta.models.deleteTitle,
            description: tMeta.models.deleteHint(m.name),
            phrase: m.name,
          }),
        },
      ]}
      emptyTitle={tMeta.models.empty}
      emptyHint={tMeta.models.emptyHint}
      columns={[
        { header: tMeta.models.name, cell: (m) => m.name },
        {
          header: tMeta.models.vendor,
          cell: (m) =>
            m.vendor_name ?? <span className="text-muted-foreground">{tMeta.vendors.none}</span>,
        },
        {
          header: tMeta.models.category,
          cell: (m) =>
            (m.category_ids ?? []).map((id) => byId.get(id) ?? id).join("、") ||
            tMeta.models.noCategory,
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="m-name">{tMeta.models.name}</FieldLabel>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="m-vendor">{tMeta.models.vendor}</FieldLabel>
            <Select value={toNone(vendorId)} onValueChange={(v) => setVendorId(fromNone(v))}>
              <SelectTrigger id="m-vendor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{tMeta.vendors.none}</SelectItem>
                  {vendorList.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {/* One device can genuinely be both a router and a spare, so several
              categories can be ticked. A dropdown cannot express that, and a
              multi-select list box hides the choices behind a scroll -- here
              the whole set is visible at once. */}
          <FieldSet className="sm:col-span-3">
            <div className="mb-3 flex items-center gap-1.5">
              <FieldLegend variant="label" className="mb-0">
                {tMeta.models.category}
              </FieldLegend>
              <Hint>{tMeta.models.categoryHint}</Hint>
            </div>
            <FieldGroup className="flex flex-row flex-wrap items-center gap-4">
              {(categories.data ?? []).map((c) => (
                <Field key={c.id} orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={`m-cat-${c.id}`}
                    checked={categoryIds.includes(c.id)}
                    onCheckedChange={(v) =>
                      setCategoryIds((cur) =>
                        v === true ? [...cur, c.id] : cur.filter((id) => id !== c.id),
                      )
                    }
                  />
                  <FieldLabel htmlFor={`m-cat-${c.id}`}>{c.name}</FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
          <div className="sm:col-span-3">
            <AttrDefaultsEditor rows={defaults} onChange={setDefaults} />
          </div>
        </div>
      }
    />

      <ModelEditor
        model={editing}
        categories={categories.data ?? []}
        vendors={vendorList}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(m) => save.mutate(m)}
        saving={save.isPending}
      />
    </>
  )
}

interface EditProps {
  model: ProductModelRow | null
  categories: Category[]
  vendors: VendorRow[]
  onOpenChange: (open: boolean) => void
  onSave: (m: ProductModelRow) => void
  saving: boolean
}

/** Edits one product model: its name, vendor, categories and defaults. */
function ModelEditor({ model, categories, vendors, onOpenChange, onSave, saving }: EditProps) {
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
          <DialogTitle>{tMeta.models.editTitle}</DialogTitle>
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
            <Select
              value={toNone(draft.vendor_id ?? "")}
              onValueChange={(v) => setDraft({ ...draft, vendor_id: fromNone(v) })}
            >
              <SelectTrigger id="me-vendor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{tMeta.vendors.none}</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
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
