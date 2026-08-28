import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { zh } from "@/i18n/zh"

interface Props {
  isLoading: boolean
  error: Error | null
  isEmpty?: boolean
  emptyTitle?: string
  emptyHint?: string
  onRetry?: () => void
  children: ReactNode
}

/**
 * Renders loading, empty and error explicitly.
 *
 * Constitution principle III requires all three states from every data view; a
 * shared component is how that becomes automatic rather than something each
 * page has to remember.
 */
export function StateBoundary({
  isLoading,
  error,
  isEmpty,
  emptyTitle,
  emptyHint,
  onRetry,
  children,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={zh.common.loading}>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="rounded-md border border-destructive/40 p-6 text-center">
        <p className="font-medium">{zh.common.error}</p>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        {onRetry && (
          <Button variant="outline" className="mt-4" onClick={onRetry}>
            {zh.common.retry}
          </Button>
        )}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center">
        <p className="font-medium">{emptyTitle}</p>
        {emptyHint && <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>}
      </div>
    )
  }

  return <>{children}</>
}
