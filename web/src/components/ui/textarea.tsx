import * as React from "react"

import { cn } from "cn"

/* Not a pill, unlike every other control in this family: a textarea is two or
 * more lines tall, and a 999px corner cuts into the first and last of them.
 * It takes the mid radius instead -- the same one the popovers and small cards
 * use, which is where a multi-line box belongs. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
