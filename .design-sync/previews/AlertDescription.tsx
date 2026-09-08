import { Alert, AlertDescription, AlertTitle, Button } from "nexus-assets-web"

/**
 * `AlertDescription` is the body. It is itself a grid with `justify-items-start`,
 * so several children stack and each sizes to its content -- a paragraph, then
 * a list, then a button, without any wrapper of your own.
 */
export const Explains = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Alert style={{ width: "100%" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <AlertTitle>这会波及 62 台设备</AlertTitle>
      <AlertDescription>
        <p>把「序列号」设为必填后，这些设备会在下次编辑时被要求补齐这一项。</p>
        <Button variant="outline" size="sm">
          查看这 62 台
        </Button>
      </AlertDescription>
    </Alert>
  </div>
)

/**
 * Under `variant="destructive"` the body goes to a softened destructive tone
 * rather than staying muted. A list of what blocked the action goes here --
 * keys and values are not translated, so they read best in `font-mono`.
 */
export const Blockers = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Alert variant="destructive" style={{ width: "100%" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <AlertTitle>无法把「序列号」设为唯一</AlertTitle>
      <AlertDescription>
        <p>已有 2 组设备的取值重复，先改掉再试：</p>
        <ul className="font-mono text-xs" style={{ display: "grid", gap: "0.125rem", margin: 0, paddingLeft: 0, listStyle: "none" }}>
          <li>serial_no = CN2417A · NW-2024-0173、NW-2024-0181</li>
          <li>serial_no = CN2417B · NW-2023-0042、NW-2023-0058</li>
        </ul>
      </AlertDescription>
    </Alert>
  </div>
)
