import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow, VendorRow } from "@/lib/metaTypes"
import { t, tMeta } from "@/i18n"
import type { BindingValue } from "@/features/fields/BindingPicker"
import {
  GroupForm,
  NO_BINDING,
  bindingBody,
  useFieldLibrary,
} from "@/features/fields/GroupEditor"
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

/** A new group: a name, the fields in it, and optionally where to bind it. */
export function GroupCreateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [members, setMembers] = useState<string[]>([])
  const [binds, setBinds] = useState<BindingValue>(NO_BINDING)
  const [error, setError] = useState<string | null>(null)

  const fields = useFieldLibrary()
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
      api.post("/field-groups", { name, field_ids: members, ...bindingBody(binds) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-groups"] })
      queryClient.invalidateQueries({ queryKey: ["fields"] })
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tMeta.fieldGroups.create}</DialogTitle>
        </DialogHeader>
        <GroupForm
          idPrefix="gc"
          name={name}
          onName={setName}
          members={members}
          onMembers={setMembers}
          fields={fields}
          binds={binds}
          onBinds={(patch) => setBinds((b) => ({ ...b, ...patch }))}
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
          <Button disabled={name === "" || create.isPending} onClick={() => create.mutate()}>
            {tMeta.fieldGroups.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
