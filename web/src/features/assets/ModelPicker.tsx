import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { ProductModelRow } from "@/lib/metaTypes"
import { modelLabel } from "@/lib/metaTypes"
import { t } from "@/i18n"
import { SearchSelect } from "@/features/common/SearchSelect"
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

interface Props {
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
 * Every model is offered, whatever the category. It took the category as a
 * prop for as long as the list was narrowed by it -- first as a filter, then
 * as an order -- and neither survives 026's ruling that a model belongs to no
 * category: a device of any category may be of any model.
 */
export function ModelPicker({ value, onChange, values, confirmOverwrite }: Props) {
  const [pending, setPending] = useState<{ id: string; overwrites: Overwrite[] } | null>(null)

  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<ProductModelRow[]>("/models"),
  })

  // Every model there is, in one order: a model belongs to no category (026),
  // so there is no "nearer" half of the list to float to the top.
  //
  // It used to sort the ones registered under this category first. 026 had
  // already stopped that association deciding the *contents* -- filtering by it
  // is what made a device silently lose its model's fields when the two
  // disagreed -- and kept it as the order. 029 removed the association itself,
  // and with it the only thing that ordering was reading. Searching is what
  // narrows this list now, which is why it is a SearchSelect.
  const candidates = (models.data ?? [])
    .filter((m) => !m.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name))

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
        {/* Searchable: models grow without bound, and since 026 the picker
            offers every one of them rather than the handful attached to the
            category -- which makes searching the only way through it. */}
        <SearchSelect
          id="asset-model"
          value={value ?? ""}
          onChange={select}
          placeholder={t.assets.noModel}
          options={candidates.map((m) => ({
            value: m.id,
            label: modelLabel(m),
            keywords: m.vendor_name,
          }))}
        />
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
