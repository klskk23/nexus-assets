import type { ReactNode } from "react"

import { cn } from "cn"

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
 * Not a Card. It does not float above the page -- it sits on it, and takes its
 * shape from an outline and a corner rather than from a second ground. `--card`
 * is reserved for things that genuinely lift off: dialogs, drawers, the sticky
 * bulk bar.
 *
 * The chip is the label and the number is the content, so the number is what
 * carries the weight -- Caprasimo at 34px, which it can do here because a count
 * is digits and digits are what that face covers. A zero is allowed to recede:
 * five equally loud cards with two of them reading 0 spend the page's attention
 * on nothing.
 *
 * Tabular figures because these sit in a row and the eye compares them --
 * proportional numerals put 1 on a narrower body than 8, which is invisible in
 * a sentence and makes a row of counts look ragged.
 */
export function StatCard({ label, count, ariaLabel, onOpen }: Props) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="border-border-muted hover:border-primary hover:bg-accent flex min-w-[152px] cursor-pointer flex-col items-start gap-2 rounded-[28px] border px-6 pt-[22px] pb-5 text-left transition-colors"
      onClick={onOpen}
    >
      {label}
      <span
        className={cn(
          "font-heading text-[34px] leading-none tabular-nums",
          count === 0 && "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  )
}
