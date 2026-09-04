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
 */
export function StatusBadge({ status, className }: Props) {
  const { label, color } = useStatuses()
  return (
    // Squarer and tighter than the default pill: this is a stamp on a
    // register line, and forty rounded lozenges down a column read as
    // decoration rather than as the one column carrying meaning.
    <Badge
      variant="outline"
      className={cn("status-chip rounded-sm px-1.5 py-0", `status-${color(status)}`, className)}
    >
      {label(status)}
    </Badge>
  )
}
