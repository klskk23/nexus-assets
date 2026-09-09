import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { VendorRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * A vendor's name, in a dialog.
 *
 * Lifted out of the page that used to be `/models/vendors` when 025 merged it
 * into the models rail. A vendor is a name and nothing else -- the fields
 * bound to it are managed from the field, as they always were.
 *
 * Renaming needs `model.manage`, not `schema.manage`: 023 split those two
 * apart precisely so somebody who manages models can fix a vendor's name
 * without also being able to reshape what every device records.
 */
export function VendorEditor({ vendor, onClose }: { vendor: VendorRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(vendor.name)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => api.patch(`/vendors/${vendor.id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] })
      // Every model carries its vendor's name, joined on read.
      queryClient.invalidateQueries({ queryKey: ["models"] })
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tMeta.vendors.editTitle}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ve-name">{tMeta.vendors.name}</FieldLabel>
            <Input id="ve-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </FieldGroup>
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
          <Button disabled={name === "" || save.isPending} onClick={() => save.mutate()}>
            {tMeta.vendors.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
