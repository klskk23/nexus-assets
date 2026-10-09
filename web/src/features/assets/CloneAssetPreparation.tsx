import { useId, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Asset, CategorySchema } from "@/lib/types"
import { t } from "@/i18n"
import { StateBoundary } from "@/components/StateBoundary"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export interface CloneSeed { asset: Asset; schema: CategorySchema }

/** Preparation is read-only; unmounting it abandons the opening session. */
export function CloneAssetPreparation({ sourceID, onOpenChange, children }: {
  sourceID: string
  onOpenChange: (open: boolean) => void
  children: (seed: CloneSeed) => ReactNode
}) {
  const session = useId()
  const preparation = useQuery({
    // gcTime alone does not discard an unobserved pending query. A new opening
    // must not join an earlier opening's still-running request for this source.
    queryKey: ["clone-asset", session, sourceID],
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const { asset } = await api.get<{ asset: Asset; value_history: unknown[] }>(`/assets/${sourceID}`)
      // Keep the preparation read private too: a late schema from an abandoned
      // opening must neither join nor overwrite the current draft's schema.
      const schema = await api.get<CategorySchema>(
        `/categories/${asset.category_id}/schema${asset.model_id ? `?model_id=${asset.model_id}` : ""}`,
      )
      return { asset, schema }
    },
  })

  // Once prepared, background refreshes cannot replace or unmount the draft.
  if (preparation.data) {
    return children(preparation.data)
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>{t.assets.cloneTitle}</DialogTitle></DialogHeader>
        <StateBoundary isLoading={preparation.isFetching} error={preparation.error}
          onRetry={() => preparation.refetch()}>{null}</StateBoundary>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
