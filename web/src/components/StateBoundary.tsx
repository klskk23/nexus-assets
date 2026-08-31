import type { ReactNode } from "react"
import { AlertCircleIcon, InboxIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
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
      <div className="flex flex-col gap-3" role="status" aria-label={zh.common.loading}>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>{zh.common.error}</AlertTitle>
        <AlertDescription>
          {error.message}
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              {zh.common.retry}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (isEmpty) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          {emptyHint && <EmptyDescription>{emptyHint}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    )
  }

  return <>{children}</>
}
