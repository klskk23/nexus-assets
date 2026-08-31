import { screen } from "@testing-library/react"
import type { UserEvent } from "@testing-library/user-event"

/**
 * Opens a row's context menu and picks an item.
 *
 * Right-clicking is a pointer gesture, not a click, so userEvent's `click`
 * does not reach it. The menu is portalled to the body like every other Radix
 * overlay, which is why the item is looked up on the whole document rather
 * than inside the row.
 */
export async function chooseFromMenu(user: UserEvent, row: HTMLElement, item: string | RegExp) {
  await user.pointer({ keys: "[MouseRight]", target: row })
  await user.click(await screen.findByRole("menuitem", { name: item }))
}

/** Opens a row's context menu without picking anything. */
export async function openMenu(user: UserEvent, row: HTMLElement) {
  await user.pointer({ keys: "[MouseRight]", target: row })
  return screen.findByRole("menu")
}
