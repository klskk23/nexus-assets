import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "nexus-assets-web"

/**
 * The control inside the pill. It is an `Input` stripped of its own border,
 * background and ring -- the group draws all three -- and marked
 * `data-slot="input-group-control"`, which is how the group knows to light up
 * its focus ring. A plain `Input` here would draw a second border inside the
 * first.
 */
export const InPill = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-64">
      <InputGroupAddon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </InputGroupAddon>
      <InputGroupInput aria-label="搜索键名、显示名" placeholder="搜索键名、显示名" defaultValue="序列号" />
    </InputGroup>
  </div>
)

/**
 * `aria-invalid` on the control turns the *group's* border destructive -- the
 * error state lives on the pill, not on the input inside it.
 */
export const Invalid = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72">
      <InputGroupInput aria-label="资产编号" aria-invalid className="font-mono" defaultValue="NW-2024-0173" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>已占用</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
)
