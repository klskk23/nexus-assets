/**
 * Copies text, on the plain-HTTP origins this product is actually served from.
 *
 * `navigator.clipboard` exists only in a secure context. Served over http on a
 * LAN address -- which is how the demo runs -- the property is undefined, so a
 * bare `navigator.clipboard.writeText(...)` throws before it copies anything.
 * Wrapped in a try/catch that reports nothing, the button looked broken because
 * it was.
 *
 * So: the modern API when it is there, otherwise select the element's own text
 * and let the browser copy the selection. The selection is left in place either
 * way -- when both paths fail, the caller can tell the reader to press Ctrl+C
 * on text that is already highlighted.
 */
export async function copyText(text: string, node?: HTMLElement | null): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission refused, or a clipboard that exists and does not work.
    }
  }

  if (!node || typeof document === "undefined") return false

  const selection = window.getSelection()
  if (!selection) return false
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)

  try {
    // Deprecated, and the only thing that works without a secure context.
    // Selecting the node rather than a hidden textarea keeps focus where it is,
    // which matters inside a dialog that traps it.
    return document.execCommand("copy")
  } catch {
    return false
  }
}
