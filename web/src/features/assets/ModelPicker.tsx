import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  categoryID: string
  value: string | null
  /** Called with the chosen model and the attribute values to merge in. */
  onChange: (modelID: string | null, patch: Record<string, unknown>) => void
  /** Current attribute values; used to decide what a model change would overwrite. */
  values: Record<string, unknown>
  /**
   * Edit mode. Creating an asset fills only the blanks silently; changing the
   * model of an existing one asks first, because the values on screen may have
   * been corrected by hand and the system does not record which.
   */
  confirmOverwrite?: boolean
}

/** One default that a model change would write over. */
interface Overwrite {
  key: string
  from: string
  to: string
}

/**
 * Chooses the device model and applies its default attribute values.
 *
 * The model list is limited to the asset's own category and its ancestors: a
 * model defined on a sibling branch has nothing to do with this device, and
 * offering it only invites a mis-selection.
 */
export function ModelPicker({ categoryID, value, onChange, values, confirmOverwrite }: Props) {
  const [pending, setPending] = useState<{ id: string; overwrites: Overwrite[] } | null>(null)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })

  // A model reaches every category below the ones it is associated with, the
  // same way bound fields are inherited. It does not climb back up: a model
  // attached to a child is not offered to the parent. Now that a model can
  // carry several categories, making it visible somewhere is an explicit act.
  const self = (categories.data ?? []).find((c) => c.id === categoryID)
  const chain = new Set((self?.path ?? "").split("/").filter(Boolean))
  const candidates = (models.data ?? []).filter(
    (m) => !m.archived_at && (m.category_ids ?? []).some((id) => chain.has(id)),
  )

  const defaultsOf = (id: string) => candidates.find((m) => m.id === id)?.attr_defaults ?? {}

  const select = (id: string) => {
    if (id === "") {
      onChange(null, {})
      return
    }
    const defaults = defaultsOf(id)
    if (!confirmOverwrite) {
      // Creating: fill only what has not been typed yet.
      const patch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(defaults)) {
        const cur = values[k]
        if (cur === undefined || cur === null || cur === "") patch[k] = v
      }
      onChange(id, patch)
      return
    }
    const overwrites = Object.entries(defaults)
      .map(([k, v]) => ({ key: k, from: String(values[k] ?? ""), to: String(v) }))
      .filter((o) => o.from !== o.to)
    if (overwrites.length === 0) {
      onChange(id, {})
      return
    }
    setPending({ id, overwrites })
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="asset-model">{t.assets.modelLabel}</FieldLabel>
        <Select value={toNone(value)} onValueChange={(v) => select(fromNone(v))}>
          <SelectTrigger id="asset-model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NONE}>{t.assets.noModel}</SelectItem>
              {candidates.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.vendor ? `${m.vendor} ${m.name}` : m.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.assets.modelChangeTitle}</DialogTitle>
            <DialogDescription>{t.assets.modelChangeHint}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1 font-mono text-sm">
            {(pending?.overwrites ?? []).map((o) => (
              <li key={o.key}>
                {o.key}: {o.from || "—"} → {o.to}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (pending) onChange(pending.id, {})
                setPending(null)
              }}
            >
              {t.assets.modelChangeSkip}
            </Button>
            <Button
              onClick={() => {
                if (pending) onChange(pending.id, defaultsOf(pending.id))
                setPending(null)
              }}
            >
              {t.assets.modelChangeApply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
