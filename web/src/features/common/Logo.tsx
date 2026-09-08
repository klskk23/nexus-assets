/**
 * The mark, rebuilt as vector from the raster in the design system.
 *
 * There was no vector source -- the canvas holding it is empty and the only
 * artefact is a screenshot -- so this is a reconstruction, not a trace. Which
 * turns out to be the better thing to ship anyway: three circles is exactly
 * what the mark is, and as SVG it takes the palette's own tokens rather than
 * baking hex values into a PNG. Recolour the product and the mark follows.
 *
 * The three fills are the three voices this palette has: terracotta for the
 * disc (the one colour with real separation), cream for the large circle (the
 * ground everything sits on), sage for the small one (quantity, the second
 * voice). Nothing else in the product puts all three together, which is what
 * makes it read as a mark rather than as a decoration.
 *
 * currentColor is deliberately absent: this is not an icon and must not take
 * the colour of the text beside it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="presentation" aria-hidden>
      <circle cx="20" cy="20" r="20" fill="var(--primary)" />
      <circle cx="15.4" cy="16.2" r="10.2" fill="var(--background)" />
      <circle cx="23.6" cy="24.6" r="7.2" fill="var(--accent-2)" />
    </svg>
  )
}
