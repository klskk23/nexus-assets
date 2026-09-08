import {
  Button,
  ButtonGroup,
  ButtonGroupText,
  Input,
} from "nexus-assets-web"

/**
 * A segment of the group that is read, not pressed. It carries the group's
 * own border and the muted ground, so it joins the run instead of floating
 * beside it -- which is what a bare `<span>` next to a ButtonGroup does.
 *
 * Here it names the unit the two buttons step: how many labels to print for
 * each device.
 */
export const AUnitLabel = () => (
  <ButtonGroup>
    <ButtonGroupText>份数</ButtonGroupText>
    <Button variant="outline" aria-label="少打一份">
      −
    </Button>
    <ButtonGroupText className="tabular-nums">2</ButtonGroupText>
    <Button variant="outline" aria-label="多打一份">
      ＋
    </Button>
  </ButtonGroup>
)

/**
 * As the prefix on an input. The group gives `[&>input]:flex-1`, so the box
 * takes the rest of the width and the label stays exactly as wide as its text.
 */
export const AsAnInputPrefix = () => (
  <ButtonGroup className="max-w-sm" style={{ width: "100%" }}>
    <ButtonGroupText>资产编号</ButtonGroupText>
    <Input placeholder="搜索" defaultValue="" />
    <Button variant="outline">查找</Button>
  </ButtonGroup>
)

/**
 * A read-only fact the buttons act on: which filter the export will follow.
 * The text segment is where "what this is about" goes when it is too long to
 * be a button's label and too important to be a tooltip.
 */
export const AScopeStatement = () => (
  <ButtonGroup>
    <ButtonGroupText>上海仓库 · 网络设备 · 137 台</ButtonGroupText>
    <Button variant="outline">导出 CSV</Button>
  </ButtonGroup>
)
