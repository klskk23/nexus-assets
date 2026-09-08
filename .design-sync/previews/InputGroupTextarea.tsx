import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from "nexus-assets-web"

/**
 * The multi-line control. The group grows to `h-auto` around it, but it does
 * *not* stop being `rounded-full` on its own -- a tall box with fully round
 * ends reads as broken, so override the radius to the design language's 28px
 * corner (`rounded-xl`) whenever a textarea is what is inside.
 */
export const Notes = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72 rounded-xl">
      <InputGroupTextarea aria-label="备注" rows={4} defaultValue="外壳有磕碰，已拍照存档；风扇噪音偏大，下次归还时一并检修。" />
      <InputGroupAddon align="block-end">
        <InputGroupText>归还时记录到这台设备的流转历史</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
)

/** A caption above, an action below -- the shape a comment box takes. */
export const WithActions = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <InputGroup className="w-72 rounded-xl">
      <InputGroupAddon align="block-start">
        <InputGroupText>转移说明</InputGroupText>
      </InputGroupAddon>
      <InputGroupTextarea aria-label="转移说明" rows={3} placeholder="说明这台设备为什么转到上海仓库" />
      <InputGroupAddon align="block-end">
        <InputGroupButton size="sm" variant="outline">
          保存
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
)
