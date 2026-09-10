import { useRef, useState, type ReactNode } from "react"

import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Whether the text in this element is actually cut off, asked at the moment
 * somebody looks.
 *
 * Truncation is a runtime fact, not a property of the string: the same holder
 * name fits on a wide screen and does not on a narrow one, and it changes
 * again when a sibling badge appears beside it. So it is measured when the
 * tooltip is asked to open rather than tracked -- one comparison, no observer,
 * and never stale.
 */
export function useTruncated<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  return {
    ref,
    isTruncated: () => {
      const el = ref.current
      return Boolean(el) && el!.scrollWidth > el!.clientWidth
    },
  }
}

/**
 * Text that says the rest of itself when it does not fit.
 *
 * **Only when it does not fit.** A tooltip repeating a label that is already
 * fully on screen is the shape of warning people learn to ignore -- the same
 * judgement `ConfirmDialog` records about handing every action an alarming
 * confirmation.
 *
 * For text sitting inside something focusable -- a rail row's link, a bar in
 * the overview -- do not use this. Put the trigger on that control instead
 * (see `useTruncated` and `TruncatedTip`), or a keyboard will never open it:
 * Radix opens on the trigger's own focus, and a span is not a tab stop. Adding
 * one would put a stop on every row of a fifty-row table, which is a worse
 * trade than a tooltip a keyboard cannot reach.
 */
export function Ellipsis({ text, className }: { text: string; className?: string }) {
  const { ref, isTruncated } = useTruncated<HTMLSpanElement>()
  const [open, setOpen] = useState(false)

  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isTruncated())}>
      <TooltipTrigger asChild>
        <span ref={ref} className={cn("block truncate", className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The same rule, when the trigger has to be the control rather than the text.
 *
 * The caller measures the inner text with `useTruncated` and hands the whole
 * focusable thing in as `children`, so hovering **and tabbing to it** open the
 * tooltip. Split from `Ellipsis` rather than folded into it with a flag: the
 * two differ in what the trigger is, which is the one thing a caller cannot
 * change afterwards.
 */
export function TruncatedTip({
  text,
  isTruncated,
  children,
}: {
  text: string
  isTruncated: () => boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isTruncated())}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}
