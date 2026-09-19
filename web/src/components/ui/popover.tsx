import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "cn"
import { useInsideDialog } from "@/lib/insideDialog"

/**
 * Modal by itself once it is inside a dialog, and not before.
 *
 * A dialog owns the page's scroll lock, and that lock cancels the wheel over
 * anything portalled out of the dialog -- which a popover panel always is. The
 * panel has to hold a lock of its own to be scrollable at all, and `modal` is
 * how Radix hands it one. Why the condition rather than always, and what
 * `modal` costs elsewhere: lib/insideDialog.ts.
 *
 * An explicit `modal` still wins, either way.
 */
function Popover({
  modal,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const insideDialog = useInsideDialog()
  return <PopoverPrimitive.Root data-slot="popover" modal={modal ?? insideDialog} {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md bg-popover p-4 text-popover-foreground shadow-lg outline-hidden",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
