import { Cube } from "@phosphor-icons/react"

import { cn } from "cn"

/**
 * The mark (030): a cube drawn as a wireframe, inside a square with a 1px
 * outline in the action colour. The handoff draws it at 28px in the rail and
 * 36px on the sign-in page; the size comes in through className and the cube
 * inside scales with it (16 of 28, 20 of 36 -- the same proportion).
 *
 * It takes the palette's own tokens rather than baking a colour in, so
 * recolouring the product carries the mark along. **A favicon cannot** --
 * public/logo.svg is a separate document with copies of the same two values,
 * which is what favicon.test.ts pins.
 *
 * currentColor is deliberately absent: this is not an icon and must not take
 * the colour of the text beside it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      role="presentation"
      aria-hidden
      className={cn(
        "border-primary text-primary grid shrink-0 place-items-center rounded-md border",
        className,
      )}
    >
      <Cube weight="regular" className="size-[57%]" />
    </span>
  )
}
