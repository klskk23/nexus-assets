import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "nexus-assets-web"

/**
 * `align` decides where the addon sits and reshapes the group around it.
 * `inline-start` (the default) and `inline-end` keep the pill one line tall
 * and pull a button inside it flush with the end; clicking either focuses the
 * input, so the whole pill behaves as one control.
 */
export const Inline = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <InputGroup className="w-72">
        <InputGroupAddon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </InputGroupAddon>
        <InputGroupInput aria-label="搜索资产编号、持有方" placeholder="搜索资产编号、持有方" />
      </InputGroup>
      <InputGroup className="w-72">
        <InputGroupInput aria-label="内存容量" className="tabular-nums" defaultValue="32" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>GB</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  </div>
)

/**
 * `block-start` and `block-end` turn the group into a column: the addon takes
 * a full-width row of its own above or below the control. Use it for a caption
 * or a row of buttons that would not fit on the input's line.
 */
export const Block = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72 rounded-xl">
      <InputGroupAddon align="block-start">
        <InputGroupText>资产编号</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput aria-label="资产编号" className="font-mono" defaultValue="NW-2024-0173" />
      <InputGroupAddon align="block-end">
        <InputGroupButton>扫码录入</InputGroupButton>
        <InputGroupText>或直接键入</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
)
