import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import { FieldForm, type FieldFormValue } from "@/features/fields/FieldForm"
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

/**
 * A new field, and the targets it is bound to in the same request.
 *
 * One request, not two: a refused binding must leave no field behind, because
 * a field bound nowhere is invisible in the very place somebody would look for
 * it. The pair is what was asked for.
 *
 * The form is the same one the editor uses -- 025 moved where creating starts
 * from (the foot of the rail rather than a page header) and changed nothing
 * about what a field is.
 */
/** A blank field, and what "reset the form" means. */
const emptyDraft: FieldFormValue = {
  key: "",
  label: "",
  type: "text",
  isUnique: false,
  required: false,
  options: {},
  bindTo: [],
  bindVendors: [],
  bindMode: "category",
}

/**
 * Per type, and only what that type means: a regex on a computed field would
 * be configuration nothing reads.
 */
function optionsFor(d: FieldFormValue) {
  switch (d.type) {
    case "computed":
      return { template: d.options.template ?? "" }
    case "text":
      return { regex: d.options.regex ?? "", regex_hint: d.options.regex_hint ?? "" }
    case "number":
      return { min: d.options.min, max: d.options.max, unit: d.options.unit }
    default:
      return {}
  }
}

export function FieldCreateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<FieldFormValue>(emptyDraft)
  const [error, setError] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })
  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<VendorRow[]>("/vendors"),
  })

  const create = useMutation({
    mutationFn: () =>
      api.post("/fields", {
        key: draft.key,
        label: draft.label,
        type: draft.type,
        is_unique: draft.isUnique,
        // One list or the other, never both -- the server refuses a mix, and
        // so does the form that produced this.
        category_ids: draft.bindMode === "category" ? draft.bindTo : [],
        model_ids: draft.bindMode === "device" ? draft.bindTo : [],
        vendor_ids: draft.bindMode === "device" ? draft.bindVendors : [],
        required: draft.required,
        options: optionsFor(draft),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tMeta.fields.create}</DialogTitle>
        </DialogHeader>
        <FieldForm
          mode="create"
          idPrefix="fc"
          value={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          categories={categories.data ?? []}
          models={Array.isArray(models.data) ? models.data : []}
          vendors={Array.isArray(vendors.data) ? vendors.data : []}
        />
        {error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            disabled={draft.key === "" || draft.label === "" || create.isPending}
            onClick={() => create.mutate()}
          >
            {tMeta.fields.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
