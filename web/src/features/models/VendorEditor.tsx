import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { VendorRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
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
 *
 * It is also the only way to delete one. 025 lifted this dialog out of the old
 * table page and left the delete behind with it -- the endpoint, the refusal
 * and both languages of the copy all stayed, and nothing on screen referenced
 * any of them. Nothing failed either: the orphan-copy guard matches bare key
 * names, and `deleteHint` is a name several other things also use.
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

  // The server refuses while any model still comes from it, and says how many.
  // That refusal is the whole safety net, so the button stays live and the
  // answer arrives in the same dialog rather than being guessed at here.
  const remove = useMutation({
    mutationFn: () => api.del(`/vendors/${vendor.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] })
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
          <ConfirmDialog
            trigger={
              <Button variant="destructive" className="mr-auto" disabled={remove.isPending}>
                {tMeta.vendors.delete}
              </Button>
            }
            title={tMeta.vendors.deleteTitle}
            description={tMeta.vendors.deleteHint(vendor.name)}
            confirmLabel={tMeta.vendors.delete}
            tone="danger"
            requirePhrase={vendor.name}
            onConfirm={() => remove.mutate()}
          />
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
