import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "cn"

/*
 * Nocturne's .tag (030): 11px, 3px 10px, a 6px corner (three quarters of the
 * control radius -- a tag inset in a control must not wear the control's own
 * corner), a touch of tracking. Tinted from the ramps: a dark step for the
 * fill and a light one for the text, never the action colour as a flood.
 *
 * Status chips do not pick a variant; StatusBadge adds .status-chip, which is
 * unlayered and overrides whatever variant colour is here.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[6px] border border-transparent px-2.5 py-[3px] text-[11px] leading-[1.3] tracking-[0.02em] whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        // The accent tint: an admin's "all permissions", an owner's initials.
        default: "bg-accent-800 text-accent-100",
        // Neutral: an action's name in a movement cell, a field's type.
        secondary: "bg-neutral-800 text-neutral-100",
        // A red tag is a red outline, like a red button.
        destructive: "border-destructive-line text-destructive",
        // The action colour as a line: "unique", "computed", a required mark.
        outline: "border-primary text-primary",
        ghost: "text-muted-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
