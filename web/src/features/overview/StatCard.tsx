import type { ReactNode } from "react"

import { cn } from "cn"
import { Card, CardContent } from "@/components/ui/card"

interface Props {
  /** What the number counts -- a status chip here, so colour and name travel together. */
  label: ReactNode
  count: number
  /** Read out in place of the card's contents, which are a chip and a bare number. */
  ariaLabel: string
  /** Where the card goes. It is a button, so it answers the keyboard too. */
  onOpen: () => void
}

/**
 * One number on the overview, and the way to the list behind it.
 *
 * The chip is the label and the number is the content, so the number is what
 * carries the weight. A zero is allowed to recede: five equally loud cards with
 * two of them reading 0 spend the page's attention on nothing.
 *
 * Tabular figures because these sit in a row and the eye compares them --
 * proportional numerals put 1 on a narrower body than 8, which is invisible in
 * a sentence and makes a row of counts look ragged.
 */
export function StatCard({ label, count, ariaLabel, onOpen }: Props) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className="hover:bg-accent focus-visible:ring-ring cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <CardContent className="px-5 py-4">
        {label}
        <p
          className={cn(
            "mt-2 text-[32px] leading-none tabular-nums",
            count === 0 && "text-muted-foreground/50",
          )}
        >
          {count}
        </p>
      </CardContent>
    </Card>
  )
}
