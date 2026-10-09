import { invalidateSchema } from "./invalidateSchema"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { Category, CategoryDraft, CategoryPreview } from "@/lib/types"

export type PreviewSection = "candidates" | "impact" | "issues"
const firstPages = () => ({ candidates: { page: 0, size: 20 }, impact: { page: 0, size: 20 }, issues: { page: 0, size: 20 } })

/** One local draft, one final write. Read-only previews never authorize a write. */
export function useCategoryDraft(category?: Category) {
  const queryClient = useQueryClient()
  const [request, setRequest] = useState(() => ({
    draft: {
      ...(category ? {} : { code: "" }),
      name: category?.name ?? "", parent_id: category?.parent_id ?? null,
      display_key: category?.display_key ?? "", print_preset_ids: category?.print_preset_ids ?? [],
      inherited_field_ids: category ? undefined : [],
    } as CategoryDraft,
    reconcile: false, pages: firstPages(),
  }))
  const [result, setResult] = useState<{ request: typeof request; preview?: CategoryPreview; error?: unknown }>()
  const endpoint = category ? `/categories/${category.id}/preview` : "/categories/preview"

  useEffect(() => {
    let obsolete = false
    const load = async () => {
      let draft = request.draft
      if (request.reconcile) {
        // Omission asks only for the new parent's candidate vocabulary. Its
        // saved selection is NOT our unsaved draft. Read every candidate page.
        const { inherited_field_ids: choices, ...probe } = draft
        const available = new Set<string>()
        let offset = 0
        for (;;) {
          const data = await api.post<CategoryPreview>(`${endpoint}?candidates_offset=${offset}&candidates_limit=200`, probe)
          if (obsolete) return
          const page = data.inheritance.candidates
          page.items.forEach(({ field }) => available.add(field.id))
          offset = page.offset + page.items.length
          if (offset >= page.total) break
          // A broken page must not silently turn a partial set into removals.
          if (page.items.length === 0) throw new Error("Incomplete candidate page")
        }
        draft = { ...draft, inherited_field_ids: (choices ?? []).filter((id) => available.has(id)) }
      }
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(request.pages)) {
        params.set(`${key}_offset`, String(value.page * value.size))
        params.set(`${key}_limit`, String(value.size))
      }
      const preview = await api.post<CategoryPreview>(`${endpoint}?${params}`, draft)
      if (obsolete) return
      // Adopt initialization/intersection atomically with its validated result.
      // Subsequent responses cannot replace explicitly empty choices.
      const resolved = { ...request, reconcile: false, draft: { ...draft, inherited_field_ids: draft.inherited_field_ids ?? preview.inheritance.selected_field_ids } }
      if (request.reconcile || draft.inherited_field_ids === undefined) {
        setRequest(resolved)
        setResult({ request: resolved, preview })
      } else setResult({ request, preview })
    }
    // The resolved initial/intersection result already belongs to this request.
    if (result?.request !== request) load().catch((error: unknown) => {
      if (!obsolete) setResult((previous) => ({ request, error, preview: previous?.preview }))
    })
    return () => { obsolete = true }
    // result is intentionally not a trigger: only a new draft or explicit retry
    // starts a request; completion must not schedule another preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, endpoint])

  const change = (values: Partial<CategoryDraft>) => setRequest((current) => ({
    ...current, draft: { ...current.draft, ...values },
    reconcile: current.reconcile || ("parent_id" in values && values.parent_id !== current.draft.parent_id),
    pages: "parent_id" in values ? firstPages() : current.pages,
  }))
  const setPage = (section: PreviewSection, page: number) => setRequest((current) => ({ ...current, pages: { ...current.pages, [section]: { ...current.pages[section], page } } }))
  const setPageSize = (section: PreviewSection, size: number) => setRequest((current) => ({ ...current, pages: { ...current.pages, [section]: { page: 0, size } } }))
  const current = result?.request === request
  const preview = result?.preview
  const loading = !current
  const error = current ? result?.error : undefined
  const ready = current && !!preview && !error && !request.reconcile && request.draft.inherited_field_ids !== undefined
  const canSave = ready && preview.issues.total === 0 && (!preview.requires_confirmation || !!preview.confirmation_token)
  const invalidate = () => invalidateSchema(queryClient)
  return {
    draft: request.draft, change, preview, loading, error, ready, canSave,
    pages: request.pages, setPage, setPageSize,
    retry: () => setRequest((current) => ({ ...current })), invalidate,
  }
}
