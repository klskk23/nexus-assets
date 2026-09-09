import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
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

/** A new vendor, which is a name and nothing else. */
export function VendorCreateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.post("/vendors", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] })
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tMeta.vendors.create}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="vc-name">{tMeta.vendors.name}</FieldLabel>
            <Input id="vc-name" value={name} onChange={(e) => setName(e.target.value)} />
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
          <Button disabled={name === "" || create.isPending} onClick={() => create.mutate()}>
            {tMeta.vendors.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
