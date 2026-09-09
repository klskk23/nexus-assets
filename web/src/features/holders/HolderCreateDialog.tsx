import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { ALLOWED_PARENTS, PARENT_REQUIRED, type EntityType, type HolderEntity } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { SearchSelect } from "@/features/common/SearchSelect"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  holders: HolderEntity[]
  onClose: () => void
}

/**
 * Adds a holder of any kind.
 *
 * One button at the foot of the rail rather than "add a child of this one":
 * the parent is a field on the form, so the button means the same thing
 * wherever the reader is standing (024 decision 4).
 */
export function HolderCreateDialog({ holders, onClose }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [type, setType] = useState<EntityType>("location")
  const [parentID, setParentID] = useState("")
  const [note, setNote] = useState("")

  const eligibleParents = holders.filter((h) => ALLOWED_PARENTS[type].includes(h.type))
  const hasCompany = holders.some((h) => h.type === "company")

  const create = useMutation({
    mutationFn: () => api.post("/holders", { type, name, note, parent_id: parentID || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holders"] })
      queryClient.invalidateQueries({ queryKey: ["holder-counts"] })
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tMeta.holders.create}</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="h-name">{tMeta.holders.name}</FieldLabel>
            <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="h-type">{tMeta.holders.type}</FieldLabel>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as EntityType)
                // The eligible parents differ per kind, so a carried-over
                // choice would be one the server is about to refuse.
                setParentID("")
              }}
            >
              <SelectTrigger id="h-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {/* A department with no company on file is offered and
                      disabled rather than silently missing: "why is 部门 not
                      in the list" is a worse question than a greyed row with a
                      reason under it. */}
                  {Object.entries(tMeta.entityTypes).map(([k, v]) => (
                    <SelectItem key={k} value={k} disabled={k === "department" && !hasCompany}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {type === "department" && !hasCompany && (
              <FieldDescription>{tMeta.holders.noCompanyYet}</FieldDescription>
            )}
          </Field>

          {ALLOWED_PARENTS[type].length > 0 && (
            <Field>
              <FieldLabel htmlFor="h-parent">{tMeta.holders.parent}</FieldLabel>
              {/* Searchable: holders grow without bound. A department has no
                  "no parent" option -- the rule is not a suggestion, and
                  offering the choice would only lead to a refusal. */}
              <SearchSelect
                id="h-parent"
                value={parentID}
                onChange={setParentID}
                placeholder={PARENT_REQUIRED[type] ? t.common.select : tMeta.holders.noParent}
                options={eligibleParents.map((h) => ({
                  value: h.id,
                  label: `${h.name}（${tMeta.entityTypes[h.type] ?? h.type}）`,
                }))}
              />
              {PARENT_REQUIRED[type] && (
                <FieldDescription>
                  {tMeta.holders.parentRequired(
                    tMeta.entityTypes[type] ?? type,
                    ALLOWED_PARENTS[type].map((p) => tMeta.entityTypes[p] ?? p),
                  )}
                </FieldDescription>
              )}
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="h-note">{tMeta.holders.note}</FieldLabel>
            <Input
              id="h-note"
              value={note}
              placeholder={tMeta.holders.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </FieldGroup>

        {create.error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>
              {create.error instanceof ApiError ? create.error.message : t.common.error}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            onClick={() => create.mutate()}
            disabled={name === "" || (PARENT_REQUIRED[type] && parentID === "") || create.isPending}
          >
            {create.isPending && <Spinner aria-hidden />}
            {tMeta.holders.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
