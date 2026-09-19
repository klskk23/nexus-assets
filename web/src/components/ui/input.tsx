import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "cn"

/*
 * Nocturne's .input (030): a surface-coloured box with a divider outline, the
 * control radius, and the caret in the action colour. The outline brightens
 * under the cursor and turns to the action colour on focus -- with the focus
 * ring's offset pulled to zero, so the ring sits on the border rather than
 * floating a gap outside it.
 *
 * Four heights because the handoff draws four: 36 is the default, 40 on the
 * sign-in page, 34 in a filter row, 32 in a rail's search box. A size, not a
 * className at the call site, so the heights stay countable.
 */
const inputVariants = cva(
  "w-full min-w-0 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-foreground caret-primary selection:bg-primary/30 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground/45 focus-visible:border-primary focus-visible:outline-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive-line",
  {
    variants: {
      size: {
        default: "h-9",
        lg: "h-10",
        filter: "h-[34px]",
        rail: "h-8",
      },
    },
    defaultVariants: { size: "default" },
  }
)

function Input({
  className,
  type,
  size,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
