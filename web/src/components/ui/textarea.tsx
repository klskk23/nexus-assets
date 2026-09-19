import * as React from "react"

import { cn } from "cn"

/* The .input, allowed to grow: 90px minimum and resizable, as the handoff
 * draws the note fields. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[90px] w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-foreground caret-primary placeholder:text-muted-foreground hover:border-foreground/45 focus-visible:border-primary focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive-line",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
