import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "cn"

/*
 * Nocturne's .btn (030). The primary is an OUTLINE in the action colour,
 * never a fill -- "an accent used as a line and a glow rather than a flood" --
 * and every state is a color-mix of that colour or of the text: 12% under the
 * cursor, 22% pressed, for the accent variants; 7% and 14% of the text for the
 * neutral one. No pills: 8px, the control radius, on every size.
 *
 * Icon buttons come in three heights because the handoff draws three: 36px
 * (.btn-icon), 30px beside a 34px filter row, 28px for a dialog's close.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent font-heading text-sm leading-tight whitespace-nowrap disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive-line [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary text-primary hover:bg-primary/12 active:bg-primary/22",
        secondary:
          "border-border text-foreground hover:bg-secondary active:bg-foreground/14",
        // Kept as a name so call sites need not change; in this system an
        // outline and a secondary are the same drawing.
        outline:
          "border-border text-foreground hover:bg-secondary active:bg-foreground/14",
        ghost: "text-primary hover:bg-primary/10 active:bg-primary/18",
        // Red is text and outline only. A filled red button is the one thing
        // on a dark ground that reads as an alarm rather than a choice.
        destructive:
          "text-destructive hover:bg-destructive/10 active:bg-destructive/18 data-[outline]:border-destructive-line",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "px-2.5 py-[5.6px] has-[>svg]:px-2",
        xs: "h-7 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[30px] gap-1.5 px-2.5 text-[13px] has-[>svg]:px-2",
        lg: "h-10 px-4 has-[>svg]:px-3",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-[30px]",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
