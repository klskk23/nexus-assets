import { screen } from "@testing-library/react"
import type { UserEvent } from "@testing-library/user-event"

/**
 * Picks an option from a shadcn Select.
 *
 * The component is a button plus a portalled listbox, not a native `<select>`,
 * so `userEvent.selectOptions` does not apply. Two consequences shape the
 * signature: the option is addressed by the text a person reads rather than by
 * its value, and the listbox is looked up on the whole document -- Radix
 * portals it to the body even when the trigger sits inside a dialog.
 */
export async function choose(user: UserEvent, trigger: HTMLElement, optionName: string | RegExp) {
  await user.click(trigger)
  await user.click(await screen.findByRole("option", { name: optionName }))
}

/** Convenience for the common case of addressing the trigger by its label. */
export async function chooseByLabel(
  user: UserEvent,
  label: string | RegExp,
  optionName: string | RegExp,
) {
  await choose(user, await screen.findByRole("combobox", { name: label }), optionName)
}
