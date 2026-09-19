"use client"

import * as React from "react"
import { Check } from "@phosphor-icons/react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "cn"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-[15px] shrink-0 rounded-sm border-[1.5px] border-neutral-600 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive-line data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <Check weight="bold" className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
