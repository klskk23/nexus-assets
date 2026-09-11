import { createContext, useContext } from "react"

/**
 * True for anything rendered inside a dialog's panel.
 *
 * A dialog does not merely cover the page, it takes the scroll away from it:
 * Radix locks scrolling with react-remove-scroll, which puts one non-passive
 * `wheel` listener on the document and cancels every wheel whose target is
 * neither inside the dialog's own panel nor a shard it was told about. That is
 * the right default -- it is what stops the table behind the dialog from
 * sliding around under the cursor.
 *
 * A popover panel is portalled to the end of `<body>`, so it is neither. Which
 * made a dropdown inside a dialog openable, typeable and clickable but **not
 * scrollable**: a list of sixty holders showed its first eight and the wheel
 * did nothing, with no scrollbar jump and no error to suggest why.
 *
 * Only the newest lock acts on an event (react-remove-scroll keeps a stack),
 * so the way out is for the popover to hold a lock of its own while it is
 * open. That is exactly what Radix's `modal` gives it. This context is how a
 * popover knows to ask for one without every call site having to remember.
 *
 * Deliberately not the default everywhere: `modal` also stops a click outside
 * from reaching what it landed on, and the asset filter bar is six of these in
 * a row, where moving from one to the next is the everyday gesture and would
 * have started costing two clicks. Inside a dialog there is no such row -- the
 * page behind is already unreachable, which is the whole point of a dialog.
 */
export const InsideDialogContext = createContext(false)

export function useInsideDialog() {
  return useContext(InsideDialogContext)
}
