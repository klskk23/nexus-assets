import { t } from "@/i18n"
import type { BoundField } from "@/lib/types"

/**
 * Narrows a category's field set to the device in front of you.
 *
 * A category's schema is its whole vocabulary, model-bound fields included, so
 * that the export, the import template and the column picker can all see the
 * full set (015, decisions 101-103). Which of those apply to one asset depends
 * on its model: a model-bound field belongs to it only when its model is one of
 * the field's own, and a device with no model has none of them.
 *
 * The server narrows the same way when it validates and when it decides which
 * stored values are still live -- this is the interface agreeing with it, not a
 * second opinion.
 */
export function fieldsForModel(fields: BoundField[], modelID: string | null): BoundField[] {
  return fields.filter(
    (f) => (f.model_ids ?? []).length === 0 || (modelID !== null && f.model_ids!.includes(modelID)),
  )
}

/** How one attribute reads. Booleans are words, not true/false. */
export function attrText(v: unknown): string {
  if (v === true) return t.common.yes
  if (v === false) return t.common.no
  if (v === null || v === undefined || v === "") return t.common.none
  return String(v)
}
