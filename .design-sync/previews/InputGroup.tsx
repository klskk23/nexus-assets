import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from "nexus-assets-web"

/**
 * The search box every list page wears (`ListToolbar`): a magnifier addon and
 * the input, welded into one pill. The whole group carries the border and the
 * focus ring -- the input inside is borderless and transparent, which is why
 * you must use `InputGroupInput` here and not a bare `Input`.
 */
export const Search = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-64">
      <InputGroupAddon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </InputGroupAddon>
      <InputGroupInput aria-label="搜索资产编号、持有方" placeholder="搜索资产编号、持有方" defaultValue="NW-" />
    </InputGroup>
  </div>
)

/** An addon at each end: the field key on the left, a copy button on the right. */
export const KeyWithCopy = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72">
      <InputGroupAddon>
        <InputGroupText>键名</InputGroupText>
      </InputGroupAddon>
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

/**
 * A textarea inside the group must not stay a pill: the group is
 * `rounded-full` and grows to `h-auto` around a textarea, so a tall box with
 * fully round ends looks broken. Override it to the design language's 28px
 * corner with `rounded-xl`.
 */
export const Multiline = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72 rounded-xl">
      <InputGroupTextarea aria-label="备注" rows={3} defaultValue="外壳有磕碰，已拍照存档；风扇噪音偏大，下次归还时一并检修。" />
      <InputGroupAddon align="block-end">
        <InputGroupText>归还时记录到这台设备的流转历史</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
)
