import { WarningCircle } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type FieldErrors } from "@/lib/api"
import type {
  Asset,
  AssetStatus,
  Category,
  CategorySchema,
  HolderEntity,
  User,
} from "@/lib/types"
import { t } from "@/i18n"
import { SearchSelect } from "@/features/common/SearchSelect"
import { useStatuses } from "@/features/statuses/useStatuses"
import { useAuth } from "@/features/auth/useAuth"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { effectiveValues, fieldsForModel } from "@/features/assets/modelFields"
import { ModelPicker } from "@/features/assets/ModelPicker"
import { CloneAssetPreparation, type CloneSeed } from "./CloneAssetPreparation"
import { StateBoundary } from "@/components/StateBoundary"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

/** Holder ids are prefixed by kind, since an account and an entity could
 *  otherwise collide in one dropdown. Radix reserves the empty string. */
const USER_PREFIX = "user:"
const ENTITY_PREFIX = "entity:"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselects a category; the overview's quick-entry card arrives with one. */
  initialCategoryID?: string
  cloneSourceID?: string
}

/** Each opening owns a fresh draft, independent of late reads from a closed one. */
export function NewAssetDialog({ open, onOpenChange, initialCategoryID, cloneSourceID }: Props) {
  if (!open) return null
  if (cloneSourceID) {
    return <CloneAssetPreparation key={cloneSourceID} sourceID={cloneSourceID} onOpenChange={onOpenChange}>
      {(clone) => <NewAssetForm onOpenChange={onOpenChange} clone={clone} />}
    </CloneAssetPreparation>
  }
  return <NewAssetForm onOpenChange={onOpenChange} initialCategoryID={initialCategoryID} />
}

/** Only static, effective fields participate; explicit null blocks model defaults. */
function cloneValues(values: Record<string, unknown>, fields: CategorySchema["fields"], edited = new Set<string>()) {
  return Object.fromEntries(fields.filter((f) => f.type !== "computed").flatMap((f) => {
    if (f.is_unique && !edited.has(f.key)) return [[f.key, null]]
    return Object.hasOwn(values, f.key) ? [[f.key, values[f.key]]] : []
  }))
}

/**
 * Records one device.
 *
 * A new device is in stock. It was reaching the ledger already checked out
 * because the status was inferred from whether a location had been picked, and
 * the picker started empty -- so the common case produced the wrong answer and
 * never said so. Status is now chosen, and starts where a new device actually
 * is.
 */
function NewAssetForm({ onOpenChange, initialCategoryID, clone }: Omit<Props, "open" | "cloneSourceID"> & { clone?: CloneSeed }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const statuses = useStatuses()
  const { user } = useAuth()

  const [categoryId, setCategoryId] = useState(clone?.asset.category_id ?? initialCategoryID ?? "")
  const [edited, setEdited] = useState(new Set<string>())
  const defaulted = useRef({ holder: false, owner: false })
  const saving = useRef(false)
  const [status, setStatus] = useState<AssetStatus>("in_stock")
  // "kind:id", so one dropdown can offer accounts and entities together.
  const [holder, setHolder] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const [modelId, setModelId] = useState<string | null>(clone?.asset.model_id ?? null)
  const [values, setValues] = useState<Record<string, unknown>>(() => clone
    ? cloneValues(clone.asset.attrs, fieldsForModel(clone.schema.fields, clone.asset.model_id)) : {})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [note, setNote] = useState(clone?.asset.note ?? "")
  const [banner, setBanner] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const holders = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
  })
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  })
  // The model is part of the question. A model's fields used to ride in on
  // the category's schema, which is what made attaching a model to a category
  // change that category; 026 severed it, so what a device can record is asked
  // of the device -- and the form has to say which device it is describing.
  const schema = useQuery({
    queryKey: ["schema", categoryId, modelId],
    queryFn: () =>
      api.get<CategorySchema>(
        `/categories/${categoryId}/schema${modelId ? `?model_id=${modelId}` : ""}`,
      ),
    enabled: categoryId !== "",
    initialData: clone && clone.asset.category_id === categoryId && clone.asset.model_id === modelId
      ? clone.schema : undefined,
  })

  // Every holder is on offer. A status no longer constrains the kind, so a
  // new device can start out in a company's or a department's custody just as
  // legitimately as on a warehouse shelf -- or in somebody's hands.
  const entities = holders.data ?? []
  const accounts = (users.data ?? []).filter((u) => u.status === "active")

  // Handing a device to a person answers "who is responsible" by itself.
  // Handing it to a company, a department or a warehouse does not, so those
  // cases ask -- the same split the transfer dialog makes.
  const heldByAccount = holder.startsWith(USER_PREFIX)
  const effectiveOwner = heldByAccount ? holder.slice(USER_PREFIX.length) : ownerId

  // Defaults arrive independently, once each. Neither a refetch nor a late
  // account/holder response is allowed to reset an input already touched.
  useEffect(() => {
    if (!defaulted.current.owner && user) {
      defaulted.current.owner = true
      setOwnerId(user.id)
    }
    if (!defaulted.current.holder && holders.data) {
      const stock = holders.data.find((h) => h.is_default_stock) ?? holders.data[0]
      if (stock || user) {
        defaulted.current.holder = true
        setHolder(stock ? ENTITY_PREFIX + stock.id : USER_PREFIX + user!.id)
      }
    }
  }, [holders.data, user])

  const fields = fieldsForModel(schema.data?.fields ?? [], modelId)
  const visibleValues = clone ? cloneValues(values, fields, edited) : values
  // Persist sanitation so a copied value cannot reappear when uniqueness is
  // switched off again. Manually entered values remain the operator's choice.
  useEffect(() => {
    if (!clone || !schema.data) return
    setValues((current) => {
      const next = cloneValues(current, fieldsForModel(schema.data.fields, modelId), edited)
      return JSON.stringify(current) === JSON.stringify(next) ? current : next
    })
  }, [clone, schema.data, modelId, edited])

  const create = useMutation({
    mutationFn: () =>
      api.post<Asset>("/assets", {
        category_id: categoryId,
        model_id: modelId,
        owner_id: effectiveOwner,
        status,
        holder_type: heldByAccount ? "user" : "entity",
        holder_id: holder.slice(holder.indexOf(":") + 1),
        attrs: effectiveValues(visibleValues, fields),
        note,
      }),
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      toast.success(t.assets.saved)
      onOpenChange(false)
      navigate(`/assets/${a.id}`)
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : t.common.error
      setFieldErrors(err instanceof ApiError ? err.fields ?? {} : {})
      setBanner(message)
      toast.error(message)
    },
    onSettled: () => { saving.current = false },
  })

  return (
    <Dialog open onOpenChange={(next) => { if (!saving.current) onOpenChange(next) }}>
      <DialogContent showCloseButton={!create.isPending} className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{clone ? t.assets.cloneTitle : t.assets.newAsset}</DialogTitle>
        </DialogHeader>

        <FieldSet disabled={create.isPending}>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="new-category">{t.assets.category}</FieldLabel>
            {/* Searchable: categories grow without bound. */}
            <SearchSelect
              id="new-category"
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v)
                // The model is cleared, but not because it belongs to the
                // category -- 026 severed that. A model chosen for one kind of
                // device is simply unlikely to be right for another.
                setModelId(null)
              }}
              placeholder={t.common.select}
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="new-status">{t.assets.statusLabel}</FieldLabel>
            <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
              <SelectTrigger id="new-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statuses.statuses.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="new-holder">{t.assets.holder}</FieldLabel>
            {/* Searchable: holders and accounts both grow without bound. */}
            <SearchSelect
              id="new-holder"
              value={holder}
              onChange={(value) => { defaulted.current.holder = true; setHolder(value) }}
              placeholder={t.common.select}
              options={[
                // The suffix marks the default stock point, which is the one
                // row a person is looking for when they have not been told
                // where to put the device.
                ...entities.map((h) => ({
                  value: ENTITY_PREFIX + h.id,
                  label: h.name + (h.is_default_stock ? t.common.defaultStockSuffix : ""),
                })),
                ...accounts.map((u) => ({ value: USER_PREFIX + u.id, label: u.name })),
              ]}
            />
          </Field>

          {/* Not asked when a person is holding it: they are the answer. */}
          {!heldByAccount && (
            <Field>
              <FieldLabel htmlFor="new-owner">{t.assets.owner}</FieldLabel>
              <SearchSelect
                id="new-owner"
                value={ownerId}
                onChange={(value) => { defaulted.current.owner = true; setOwnerId(value) }}
                placeholder={t.common.select}
                options={accounts.map((u) => ({ value: u.id, label: u.name }))}
              />
            </Field>
          )}

          {/* A built-in like the four above it, and a sentence rather than a
              field: it belongs to the device, not to its category's schema. */}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="new-note">{t.assets.note}</FieldLabel>
            <Textarea
              id="new-note"
              rows={2}
              value={note}
              placeholder={t.assets.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </FieldGroup>

        {categoryId && (
          <StateBoundary isLoading={schema.isLoading} error={schema.error as Error | null} onRetry={() => schema.refetch()}>
            <div className="grid gap-4">
              <p className="text-neutral-500 text-xs">{t.assets.generatedSN}</p>
              <ModelPicker
                value={modelId}
                values={visibleValues}
                onChange={(id, patch) => {
                  setModelId(id)
                  // The patch was computed against the previous schema. In a
                  // clone, leave defaults to the server; the target schema will
                  // explicitly null every unique field before submission.
                  if (!clone) setValues((cur) => ({ ...cur, ...patch }))
                }}
              />
              {schema.data && (
                <DynamicForm
                  fields={fields}
                  values={visibleValues}
                  errors={fieldErrors}
                  onChange={(k, v) => {
                    setEdited((current) => new Set(current).add(k))
                    setValues((cur) => ({ ...cur, [k]: v }))
                  }}
                />
              )}
            </div>
          </StateBoundary>
        )}

        </FieldSet>

        {banner && (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={create.isPending}>{t.common.cancel}</Button>
          </DialogClose>
          <Button
            onClick={() => {
              if (saving.current) return
              saving.current = true
              setFieldErrors({})
              setBanner(null)
              create.mutate()
            }}
            disabled={categoryId === "" || holder === "" || effectiveOwner === "" || create.isPending || !schema.data || schema.isFetching || schema.isError}
          >
            {create.isPending && <Spinner aria-hidden />}
            {create.isPending ? t.assets.saving : t.assets.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
