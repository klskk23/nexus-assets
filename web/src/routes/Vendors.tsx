import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import type { VendorRow } from "@/lib/metaTypes"
import { usePermissions } from "@/features/auth/usePermissions"
import { t, tMeta } from "@/i18n"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import { MetadataTabs } from "@/features/metadata/MetadataTabs"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"

/**
 * The vendors a model can come from, and a field can be bound to.
 *
 * Its own route rather than a second table on /models: two lists behind one
 * address would share the search box and the page number, and typing in one
 * would page the other (decision 107).
 */
export function Vendors() {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const [editing, setEditing] = useState<VendorRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState("")

  const invalidate = () => {
    setNotice(null)
    queryClient.invalidateQueries({ queryKey: ["vendors"] })
    // Every model row shows the vendor's name, so a rename reaches that list.
    queryClient.invalidateQueries({ queryKey: ["models"] })
  }
  const fail = (e: unknown) => setNotice(e instanceof ApiError ? e.message : t.common.error)

  const save = useMutation({
    mutationFn: (v: VendorRow) => api.patch(`/vendors/${v.id}`, { name: v.name }),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/vendors/${id}`),
    onSuccess: invalidate,
    onError: fail,
  })

  return (
    <>
      <CrudPage<VendorRow>
        title={tMeta.vendors.title}
        queryKey="vendors"
        searchHint={tMeta.vendors.searchHint}
        list={(params) => api.get<ListPage<VendorRow>>(`/vendors?${params}`)}
        toolbarActions={<MetadataTabs current="vendors" />}
        createLabel={tMeta.vendors.create}
        createDeniedReason={deniedReason("schema.manage")}
        createDisabled={name === ""}
        onCreated={() => setName("")}
        create={() => api.post("/vendors", { name })}
        notice={
          notice && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )
        }
        onRowClick={(v) => setEditing(v)}
        rowActions={[
          { label: tMeta.vendors.edit, onSelect: (v) => setEditing(v) },
          {
            label: tMeta.vendors.delete,
            destructive: true,
            onSelect: (v) => remove.mutate(v.id),
            confirm: (v) => ({
              title: tMeta.vendors.deleteTitle,
              description: tMeta.vendors.deleteHint(v.name),
              phrase: v.name,
            }),
          },
        ]}
        emptyTitle={tMeta.vendors.empty}
        emptyHint={tMeta.vendors.emptyHint}
        columns={[
          { header: tMeta.vendors.name, cell: (v) => v.name },
          {
            header: tMeta.vendors.modelCount,
            cell: (v) => <span className="tabular-nums">{v.model_count ?? 0}</span>,
          },
        ]}
        form={
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="v-name">{tMeta.vendors.name}</FieldLabel>
              <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </FieldGroup>
        }
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tMeta.vendors.editTitle}</DialogTitle>
          </DialogHeader>
          {editing && (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ve-name">{tMeta.vendors.name}</FieldLabel>
                <Input
                  id="ve-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
            </FieldGroup>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t.common.cancel}</Button>
            </DialogClose>
            <Button
              disabled={!editing || editing.name === "" || save.isPending}
              onClick={() => editing && save.mutate(editing)}
            >
              {tMeta.vendors.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
