/**
 * Where a dialog puts the caret when it opens.
 *
 * Radix hands initial focus to the first tabbable node inside the panel. In
 * this product that is regularly the `?` beside a field's label, because a
 * hint sits next to the thing it explains and labels come before controls.
 * Two things went wrong at once:
 *
 * 1. The hint is a HoverCard, and Radix HoverCard opens on focus so keyboard
 *    users can reach it. Focused programmatically, it opened on its own --
 *    every visit to Settings began with an explanation nobody asked for.
 * 2. Even with nothing popping up, the landing spot was wrong. A dialog should
 *    open on the first thing you came to use, not on an annotation about it.
 *
 * So the panel skips hints when choosing where to land. It does not make them
 * unreachable: they are still in the tab order, one Shift+Tab from the control
 * they belong to, and focusing one by hand still opens it -- which is the
 * behaviour that made HoverCard the right component in the first place.
 *
 * An explicit `autoFocus` in the dialog's own markup still wins; a caller that
 * has said where focus belongs has said something this cannot improve on.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

/** Radix's `onOpenAutoFocus`: land on the first real control, not on a hint. */
export function focusFirstControl(event: Event) {
  const root = (event.currentTarget ?? event.target) as HTMLElement | null
  if (!root?.querySelectorAll) return

  const explicit = root.querySelector<HTMLElement>("[autofocus]")
  const target =
    explicit ??
    [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      (el) => !el.closest("[data-slot=hint]"),
    )

  // Nothing but hints in here: leave Radix's default alone rather than
  // inventing a worse one. It focuses the panel, which is the right answer
  // for a dialog that holds no controls.
  if (!target) return

  event.preventDefault()
  target.focus()
}
