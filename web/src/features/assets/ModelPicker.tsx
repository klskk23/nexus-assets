import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import type { ProductModelRow } from "@/lib/metaTypes"
import { zh } from "@/i18n/zh"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

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

  const self = (categories.data ?? []).find((c) => c.id === categoryID)
  const chain = new Set((self?.path ?? "").split("/").filter(Boolean))
  const candidates = (models.data ?? []).filter(
    (m) => !m.archived_at && chain.has(m.category_id),
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
      <div className="grid gap-1.5">
        <Label htmlFor="asset-model">{zh.assets.modelLabel}</Label>
        <select
          id="asset-model"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={value ?? ""}
          onChange={(e) => select(e.target.value)}
        >
          <option value="">{zh.assets.noModel}</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.vendor ? `${m.vendor} ${m.name}` : m.name}
            </option>
          ))}
        </select>
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{zh.assets.modelChangeTitle}</DialogTitle>
            <DialogDescription>{zh.assets.modelChangeHint}</DialogDescription>
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
              {zh.assets.modelChangeSkip}
            </Button>
            <Button
              onClick={() => {
                if (pending) onChange(pending.id, defaultsOf(pending.id))
                setPending(null)
              }}
            >
              {zh.assets.modelChangeApply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
