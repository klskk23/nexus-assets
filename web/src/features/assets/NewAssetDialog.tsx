import { AlertCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
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
import { useStatuses } from "@/features/statuses/useStatuses"
import { useAuth } from "@/features/auth/useAuth"
import { DynamicForm } from "@/features/assets/DynamicForm"
import { ModelPicker } from "@/features/assets/ModelPicker"
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
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
export function NewAssetDialog({ open, onOpenChange, initialCategoryID }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const statuses = useStatuses()
  const { user } = useAuth()

  const [categoryId, setCategoryId] = useState(initialCategoryID ?? "")
  const [status, setStatus] = useState<AssetStatus>("in_stock")
  // "kind:id", so one dropdown can offer accounts and entities together.
  const [holder, setHolder] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const [modelId, setModelId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [note, setNote] = useState("")
  const [banner, setBanner] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
    enabled: open,
  })
  const holders = useQuery({
    queryKey: ["holders"],
    queryFn: () => api.get<HolderEntity[]>("/holders"),
    enabled: open,
  })
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: open,
  })
  const schema = useQuery({
    queryKey: ["schema", categoryId],
    queryFn: () => api.get<CategorySchema>(`/categories/${categoryId}/schema`),
    enabled: open && categoryId !== "",
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

  // Opening resets the form. The holders query settles after the dialog is
  // already open, so this runs again when it arrives and lands the defaults on
  // the stock point rather than on whatever was first in the list.
  useEffect(() => {
    if (!open) return
    const all = holders.data ?? []
    // The default stock point first: a device being recorded has usually just
    // arrived at one. Any other holder beats none.
    const stock = all.find((h) => h.is_default_stock) ?? all[0]

    setCategoryId(initialCategoryID ?? "")
    setModelId(null)
    setValues({})
    setNote("")
    setFieldErrors({})
    setBanner(null)
    // Always in stock: a device being recorded has just arrived. It used to
    // fall back to "checked out" when no location existed, because in stock
    // demanded one -- that constraint is gone, so the honest default holds
    // whatever holders are on file.
    setStatus("in_stock")
    setHolder(stock ? ENTITY_PREFIX + stock.id : user ? USER_PREFIX + user.id : "")
    setOwnerId(user?.id ?? "")
  }, [open, initialCategoryID, holders.data, user])

  const create = useMutation({
    mutationFn: () =>
      api.post<Asset>("/assets", {
        category_id: categoryId,
        model_id: modelId,
        owner_id: effectiveOwner,
        status,
        holder_type: heldByAccount ? "user" : "entity",
        holder_id: holder.slice(holder.indexOf(":") + 1),
        attrs: values,
        note,
      }),
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      onOpenChange(false)
      navigate(`/assets/${a.id}`)
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields ?? {})
        setBanner(err.message)
      } else {
        setBanner(t.common.error)
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.assets.newAsset}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="new-category">{t.assets.category}</FieldLabel>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v)
                // A model belongs to one category chain; keeping the old choice
                // across a category change would silently attach the wrong one.
                setModelId(null)
              }}
            >
              <SelectTrigger id="new-category">
                <SelectValue placeholder={t.common.select} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
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
            <Select value={holder} onValueChange={setHolder}>
              <SelectTrigger id="new-holder">
                <SelectValue placeholder={t.common.select} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t.common.entityGroup}</SelectLabel>
                  {entities.map((h) => (
                    <SelectItem key={h.id} value={ENTITY_PREFIX + h.id}>
                      {h.name}
                      {h.is_default_stock ? t.common.defaultStockSuffix : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>{t.common.user}</SelectLabel>
                  {accounts.map((u) => (
                    <SelectItem key={u.id} value={USER_PREFIX + u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {/* Not asked when a person is holding it: they are the answer. */}
          {!heldByAccount && (
            <Field>
              <FieldLabel htmlFor="new-owner">{t.assets.owner}</FieldLabel>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger id="new-owner">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {accounts.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
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
        </div>

        {categoryId && (
          <StateBoundary isLoading={schema.isLoading} error={schema.error as Error | null}>
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{t.assets.generatedSN}</p>
              <ModelPicker
                categoryID={categoryId}
                value={modelId}
                values={values}
                onChange={(id, patch) => {
                  setModelId(id)
                  setValues((cur) => ({ ...cur, ...patch }))
                }}
              />
              {schema.data && (
                <DynamicForm
                  fields={schema.data.fields}
                  values={values}
                  errors={fieldErrors}
                  onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))}
                />
              )}
            </div>
          </StateBoundary>
        )}

        {banner && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{banner}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            onClick={() => create.mutate()}
            disabled={categoryId === "" || holder === "" || effectiveOwner === "" || create.isPending}
          >
            {create.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {create.isPending ? t.assets.saving : t.assets.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
