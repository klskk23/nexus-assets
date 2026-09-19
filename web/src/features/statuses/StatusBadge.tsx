import { Badge } from "@/components/ui/badge"
import { cn } from "cn"
import { useStatuses } from "@/features/statuses/useStatuses"

interface Props {
  status: string
  className?: string
}

/**
 * A status, coloured by the palette slot it was configured with.
 *
 * Every status used to render as the same grey `secondary` badge, which meant
 * the one column people actually scan carried no information until they read
 * it. The colour is not decoration: it is what makes a lost device findable in
 * a page of forty rows.
 *
 * The chip is the .tag at the badge's own size (11px, 3px 10px); .status-chip
 * paints it from the slot's three values and outranks the variant.
 */
export function StatusBadge({ status, className }: Props) {
  const { label, color } = useStatuses()
  return (
    <Badge variant="secondary" className={cn("status-chip", `status-${color(status)}`, className)}>
      {label(status)}
    </Badge>
  )
}
