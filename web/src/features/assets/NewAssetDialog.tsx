import { AlertCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type FieldErrors } from "@/lib/api"
import type { Asset, AssetStatus, Category, CategorySchema, HolderEntity } from "@/lib/types"
import { zh } from "@/i18n/zh"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

/** The account itself, as a holder. Radix reserves the empty string. */
const SELF = "__self"

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
  const [holderId, setHolderId] = useState(SELF)
  const [modelId, setModelId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
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
  const schema = useQuery({
    queryKey: ["schema", categoryId],
    queryFn: () => api.get<CategorySchema>(`/categories/${categoryId}/schema`),
    enabled: open && categoryId !== "",
  })

  const locations = (holders.data ?? []).filter((h) => h.type === "location")
  // In stock means the device is in a warehouse, so the server refuses any
  // other kind of holder. With no location on file that status is unreachable.
  const canStock = locations.length > 0
  const requiresLocation = status === "in_stock"

  // Opening resets the form. The holders query settles after the dialog is
  // already open, so this runs again when it arrives and lands the defaults on
  // the stock point rather than on whatever was first in the list.
  useEffect(() => {
    if (!open) return
    const locs = (holders.data ?? []).filter((h) => h.type === "location")
    const stock = locs.find((h) => h.is_default_stock) ?? locs[0]

    setCategoryId(initialCategoryID ?? "")
    setModelId(null)
    setValues({})
    setFieldErrors({})
    setBanner(null)
    setStatus(stock ? "in_stock" : "in_use")
    setHolderId(stock ? stock.id : SELF)
  }, [open, initialCategoryID, holders.data])

  const create = useMutation({
    mutationFn: () =>
      api.post<Asset>("/assets", {
        category_id: categoryId,
        model_id: modelId,
        owner_id: user?.id,
        status,
        // A fresh install has no locations, so the first device may be held by
        // the person recording it.
        holder_type: holderId === SELF ? "user" : "entity",
        holder_id: holderId === SELF ? user?.id : holderId,
        attrs: values,
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
        setBanner(zh.common.error)
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{zh.assets.newAsset}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="new-category">{zh.assets.category}</FieldLabel>
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
                <SelectValue placeholder={zh.common.select} />
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
            <FieldLabel htmlFor="new-status">{zh.assets.statusLabel}</FieldLabel>
            <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
              <SelectTrigger id="new-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statuses.statuses.map((s) => (
                    <SelectItem
                      key={s.key}
                      value={s.key}
                      // A status that insists on a location is unreachable
                      // until one exists.
                      disabled={s.requires_location && !canStock}
                    >
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {!canStock && <FieldDescription>{zh.assets.noLocationYet}</FieldDescription>}
          </Field>

          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="new-holder">{zh.assets.holder}</FieldLabel>
            <Select value={holderId} onValueChange={setHolderId}>
              <SelectTrigger id="new-holder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {/* In stock has to be a location, so the account is not on
                      offer while that status is chosen. */}
                  <SelectItem value={SELF} disabled={requiresLocation}>
                    {user?.name ?? zh.common.none}
                  </SelectItem>
                  {locations.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                      {h.is_default_stock ? zh.common.defaultStockSuffix : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {requiresLocation && <FieldDescription>{zh.assets.inStockNeedsLocation}</FieldDescription>}
          </Field>
        </div>

        {categoryId && (
          <StateBoundary isLoading={schema.isLoading} error={schema.error as Error | null}>
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{zh.assets.generatedSN}</p>
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
            <Button variant="ghost">{zh.common.cancel}</Button>
          </DialogClose>
          <Button onClick={() => create.mutate()} disabled={categoryId === "" || create.isPending}>
            {create.isPending && <Spinner data-icon="inline-start" aria-hidden />}
            {create.isPending ? zh.assets.saving : zh.assets.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
