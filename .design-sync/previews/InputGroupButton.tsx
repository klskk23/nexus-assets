import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "nexus-assets-web"

/**
 * `InputGroupButton` is a `Button` pre-sized to fit inside the pill -- ghost
 * by default, `xs` by default, and always shadowless so it does not fight the
 * group's own edge. It only looks right inside an `InputGroupAddon`, which
 * pulls it flush with the end of the pill.
 */
export const Icon = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72">
      <InputGroupInput aria-label="字段键名" className="font-mono" defaultValue="serial_no" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="复制键名">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
)

/** With a label, and at `sm` -- the largest that still clears the pill's edge. */
export const Labelled = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <InputGroup className="w-72">
        <InputGroupInput aria-label="资产编号" className="font-mono" defaultValue="NW-2024-0173" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>查库存</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup className="w-72">
        <InputGroupInput aria-label="持有方" defaultValue="上海仓库" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="sm" variant="outline">
            换持有方
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  </div>
)
