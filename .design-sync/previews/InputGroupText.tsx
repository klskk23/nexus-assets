import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupTextarea } from "nexus-assets-web"

/**
 * `InputGroupText` is the muted, non-interactive label inside an addon -- a
 * unit, a prefix, a hint. It is a `span` with no padding of its own: the addon
 * around it supplies the spacing, so it belongs inside one rather than loose
 * in the group.
 */
export const UnitSuffix = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <InputGroup className="w-72">
        <InputGroupInput aria-label="内存容量" className="tabular-nums" defaultValue="32" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>GB</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup className="w-72">
        <InputGroupAddon>
          <InputGroupText>保修至</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="保修至" className="tabular-nums" defaultValue="2027-04-30" />
      </InputGroup>
    </div>
  </div>
)

/** As a caption in a block addon, under a textarea. */
export const Caption = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72 rounded-xl">
      <InputGroupTextarea aria-label="维修说明" rows={3} defaultValue="送修原因：风扇异响。已联系供应商，预计两周后返还。" />
      <InputGroupAddon align="block-end">
        <InputGroupText>这段说明会写进设备的流转记录</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
)
