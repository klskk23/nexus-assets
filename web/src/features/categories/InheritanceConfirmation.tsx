import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ApiError } from "@/lib/api"
import type { Category, CategoryPreview } from "@/lib/types"
import { t, tMeta } from "@/i18n"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { InheritanceImpact } from "./InheritanceImpact"

/** Mounted for one frozen operation. Pagination never submits or changes its draft. */
export function InheritanceConfirmation({ initial, categories, load, onConfirm, onCancel, confirmLabel }: {
  initial?: CategoryPreview
  categories: Category[]
  load: (params: string) => Promise<CategoryPreview>
  onConfirm: (token: string) => Promise<unknown>
  onCancel: () => void
  confirmLabel: string
}) {
  const text = tMeta.categories.inheritance
  const [request, setRequest] = useState({ impact: { page: 0, size: 20 }, issues: { page: 0, size: 20 } })
  const [result, setResult] = useState<{ request: typeof request; data: CategoryPreview } | undefined>(() => initial ? { request, data: initial } : undefined)
  const [error, setError] = useState<string>()
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (result?.request === request) return
    let obsolete = false
    const params = new URLSearchParams()
    for (const [section, page] of Object.entries(request)) {
      params.set(`${section}_offset`, String(page.page * page.size)); params.set(`${section}_limit`, String(page.size))
    }
    load(params.toString()).then((data) => { if (!obsolete) { setResult({ request, data }); setError(undefined); setStale(false) } }).catch((e: unknown) => {
      if (!obsolete) setError(e instanceof ApiError ? e.message : t.common.error)
    })
    return () => { obsolete = true }
    // The parent freezes load's operation for this mount. Only paging/retry loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])
  const loading = result?.request !== request && !error
  const data = result?.data
  const confirm = async () => {
    if (!data || loading || stale || error || pending) return
    setPending(true)
    try { await onConfirm(data.confirmation_token) } catch (e) {
      const message = e instanceof ApiError ? e.message : t.common.error
      setError(message); setStale(true); toast.error(message)
    } finally { setPending(false) }
  }
  return <AlertDialog open onOpenChange={(open) => !open && !pending && onCancel()}>
    <AlertDialogContent className="max-h-[85vh] overflow-y-auto grid-cols-[minmax(0,1fr)]" onEscapeKeyDown={(e) => { if (pending) e.preventDefault() }}>
      <AlertDialogHeader><AlertDialogTitle>{text.confirmTitle}</AlertDialogTitle><AlertDialogDescription>{text.confirmHint}</AlertDialogDescription></AlertDialogHeader>
      {loading && <div role="status" aria-label={text.loading}><Skeleton className="h-8 w-full" /></div>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {data && <InheritanceImpact preview={data} categories={categories} onPage={(section, page) => { if (!pending) { setError(undefined); setRequest((r) => ({ ...r, [section]: { ...r[section], page } })) } }} onPageSize={(section, size) => { if (!pending) { setError(undefined); setRequest((r) => ({ ...r, [section]: { page: 0, size } })) } }} />}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t.common.cancel}</AlertDialogCancel>
        {(stale || error) ? <Button disabled={pending || loading} onClick={() => { setError(undefined); setRequest((r) => ({ ...r })) }}>{text.refresh}</Button> : <Button disabled={pending || loading || !data || data.issues.total > 0 || (data.requires_confirmation && !data.confirmation_token)} onClick={confirm}>{pending && <Spinner aria-hidden />}{pending ? text.saving : confirmLabel}</Button>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
