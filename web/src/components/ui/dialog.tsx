import * as React from "react"
import { X } from "@phosphor-icons/react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "cn"
import { focusFirstControl } from "@/lib/dialogFocus"
import { InsideDialogContext } from "@/lib/insideDialog"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-neutral-900/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onOpenAutoFocus={focusFirstControl}
        className={cn(
          // grid-cols-[minmax(0,1fr)] rather than a bare grid: an auto track
          // is at least as wide as its widest child's min-content, so one row
          // that cannot shrink -- five toggle buttons, a long unbroken word --
          // widens the track past the panel's own content box. Every stretched
          // child then follows it, and the footer, the only one with negative
          // margins reaching the panel edge, is where that becomes visible: it
          // hangs off the rounded corner. minmax(0,...) caps the track at the
          // space that exists, so an oversized child overflows on its own
          // instead of moving the panel out from under everything else.
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] grid-cols-[minmax(0,1fr)] gap-4 rounded-lg bg-card p-[22px_24px] shadow-lg outline-none sm:max-w-lg",
          className
        )}
        {...props}
      >
        {/* Anything opened from in here needs to know it is in here: the panel
            holds the page's scroll lock, and a floating panel portalled out of
            it cannot be scrolled until it takes a lock of its own. See
            lib/insideDialog.ts. */}
        <InsideDialogContext.Provider value={true}>{children}</InsideDialogContext.Provider>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="text-primary hover:bg-primary/10 active:bg-primary/18 absolute top-4 right-4 z-10 grid size-7 place-items-center rounded-md disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <X />
            <span className="sr-only">{t.common.close}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        /* Right-aligned actions on the panel itself (handoff: .dialog-actions).
         * The destructive action, when there is one, sits at the far left with
         * mr-auto -- the caller places it; this row only decides the direction. */
        "mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t.common.close}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-xl leading-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
