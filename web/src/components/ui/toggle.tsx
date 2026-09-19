import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "cn"

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md border border-transparent text-[13px] whitespace-nowrap hover:bg-secondary disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive-line data-[state=on]:bg-transparent data-[state=on]:text-primary data-[state=on]:shadow-[inset_0_0_0_1px_var(--primary)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border-border bg-transparent",
      },
      size: {
        default: "h-[34px] min-w-9 px-3",
        sm: "h-[30px] min-w-8 px-2.5",
        lg: "h-9 min-w-10 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
