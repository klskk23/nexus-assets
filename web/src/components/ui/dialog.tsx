import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "cn"
import { focusFirstControl } from "@/lib/dialogFocus"
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
        "fixed inset-0 z-50 bg-foreground/38 backdrop-blur-[3px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
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
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] grid-cols-[minmax(0,1fr)] gap-6 rounded-2xl border bg-card p-8 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {/* The soft shape in the corner -- decoration, and the one place the
            palette's second voice appears on a floating surface.
 
            It is clipped by ITS OWN layer, never by the panel. Putting
            `overflow-hidden` on the panel would clip the shape correctly and
            silently break every dialog that is taller than the viewport and
            scrolls inside itself (the device form, settings, a category with
            many fields): the end of the content would simply stop existing,
            with no error and nothing to see unless you scrolled to the bottom
            looking for it.
 
            inset-0 with the panel's own radius, pointer-events-none so it
            never eats a click, aria-hidden because it says nothing. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        >
          <span className="bg-accent-2/22 absolute -top-[72px] -right-14 block size-[190px] rounded-full" />
        </span>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="bg-foreground/6 text-foreground hover:bg-accent hover:text-accent-foreground absolute top-5 right-5 z-10 grid size-[38px] place-items-center rounded-full transition-colors disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[17px]"
          >
            <XIcon />
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
        /* A full-bleed band, not a row of buttons floating on the panel.
         *
         * The panel keeps its p-8 and the band cancels it with negative
         * margins, so the band reaches the panel's edges while every one of
         * the twenty call sites stays exactly as it was. Taking the padding
         * off the panel instead would have meant editing all twenty, and
         * every dialog written after this one.
         *
         * The bottom corners follow the panel's own radius; without that the
         * band's square corners poke out through the panel's curve.
         *
         * Left-aligned, because everything else on this product is. */
        "bg-well -mx-8 -mb-8 mt-2 flex flex-col-reverse gap-3 rounded-b-2xl px-8 py-5 sm:flex-row sm:justify-start",
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
      className={cn("text-lg leading-none font-semibold", className)}
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
