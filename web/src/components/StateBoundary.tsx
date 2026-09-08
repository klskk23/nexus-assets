import type { ReactNode } from "react"
import { AlertCircleIcon, type LucideIcon } from "lucide-react"
import { useLocation } from "react-router"

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
import { t } from "@/i18n"
import { navIcon } from "@/features/common/navIcons"

interface Props {
  isLoading: boolean
  error: Error | null
  isEmpty?: boolean
  emptyTitle?: string
  emptyHint?: string
  /**
   * Overrides the icon, for an empty state that is not about the page it sits
   * on -- a device with no movements is not an empty asset list.
   */
  emptyIcon?: LucideIcon
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
  emptyIcon,
  onRetry,
  children,
}: Props) {
  // Taken from the route rather than passed in by each of the eleven callers:
  // a twelfth page should get the right icon by existing, not by remembering.
  const { pathname } = useLocation()
  const Icon = emptyIcon ?? navIcon(pathname)
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={t.common.loading}>
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
        <AlertTitle>{t.common.error}</AlertTitle>
        <AlertDescription>
          {error.message}
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              {t.common.retry}
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
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          {emptyHint && <EmptyDescription>{emptyHint}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    )
  }

  return <>{children}</>
}
