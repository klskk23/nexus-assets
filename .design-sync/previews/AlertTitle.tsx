import { Alert, AlertDescription, AlertTitle } from "nexus-assets-web"

/**
 * `AlertTitle` is the one line that says what happened, or what is about to.
 * It is `line-clamp-1` -- a second clause is silently truncated, not wrapped --
 * so the sentence that explains belongs in `AlertDescription` under it.
 */
export const Headline = () => (
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
 * A title with no description -- the whole message in one line. It keeps a
 * `min-h-4` so an alert built this way still has the height of a full one.
 */
export const Alone = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <div style={{ display: "grid", gap: "0.75rem", width: "100%" }}>
      <Alert>
        <AlertTitle>这个字段已经绑定到「网络设备」，不能再改绑定方式。</AlertTitle>
      </Alert>
      <Alert variant="destructive">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <AlertTitle>资产编号 NW-2024-0173 已被占用。</AlertTitle>
      </Alert>
    </div>
  </div>
)
