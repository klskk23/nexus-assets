import { Alert, AlertDescription, AlertTitle } from "nexus-assets-web"

/**
 * An `Alert` carries a consequence you should know *before* you act, or a
 * refusal after you tried. It stays on the page rather than hiding behind a
 * question mark -- if the reader has to hover to find it, it is a tooltip, not
 * this.
 *
 * A leading `svg` is not decoration: the root is a two-column grid whose first
 * column is 0 wide until an `svg` is a direct child, which is what widens it
 * and lines the title and the body up beside the icon.
 */
export const Consequence = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Alert style={{ width: "100%" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <AlertTitle>这会波及 62 台设备</AlertTitle>
      <AlertDescription>
        把「序列号」设为必填后，这些设备会在下次编辑时被要求补齐这一项。
      </AlertDescription>
    </Alert>
  </div>
)

/**
 * A statement of current state -- something already true that narrows what you
 * can still do. No icon here: the grid collapses its first column and the text
 * runs full width, which suits a one-line fact.
 */
export const StateOfPlay = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Alert style={{ width: "100%" }}>
      <AlertTitle>绑定方式已经定下</AlertTitle>
      <AlertDescription>这个字段已经绑定到「网络设备」，绑定之后不能再换成按厂商绑定。</AlertDescription>
    </Alert>
  </div>
)

/**
 * The destructive variant is for a refusal -- the thing you asked for did not
 * happen, and here is why. When the refusal comes from a form inside a dialog
 * it must be rendered *inside* that dialog: the page behind an open dialog is
 * `aria-hidden`, so an alert left out there is announced to nobody.
 */
export const Refusal = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Alert variant="destructive" style={{ width: "100%" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <AlertTitle>无法删除这个字段</AlertTitle>
      <AlertDescription>
        有 3 条表达式引用了它，先改掉这些引用再删。
      </AlertDescription>
    </Alert>
  </div>
)
