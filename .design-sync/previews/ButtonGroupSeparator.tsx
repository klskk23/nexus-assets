import { Button, ButtonGroup, ButtonGroupSeparator } from "nexus-assets-web"

/**
 * The hairline inside a joined run of buttons. It is not decoration: it is
 * where the meaning changes.
 *
 * In the selection bar it stands between the five reversible transfer acts and
 * 删除 -- the same click distance, a different kind of act. Everything left of
 * the line can be undone by doing the opposite; nothing right of it can.
 */
export const BeforeADestructiveAction = () => (
  <ButtonGroup>
    <Button size="sm" variant="outline">
      签出
    </Button>
    <Button size="sm" variant="outline">
      归还
    </Button>
    <Button size="sm" variant="outline">
      转移
    </Button>
    <ButtonGroupSeparator />
    <Button size="sm" variant="outline" className="text-destructive">
      删除
    </Button>
  </ButtonGroup>
)

/**
 * Two separators, three runs: what happens to the devices, what happens to
 * paper and files about them, and what cannot be taken back. A run of eight
 * undivided buttons is a list nobody reads to the end of.
 */
export const ThreeRuns = () => (
  <ButtonGroup>
    <Button size="sm" variant="outline">
      签出
    </Button>
    <Button size="sm" variant="outline">
      归还
    </Button>
    <Button size="sm" variant="outline">
      改状态
    </Button>
    <ButtonGroupSeparator />
    <Button size="sm" variant="outline">
      打印标签
    </Button>
    <Button size="sm" variant="outline">
      导出 CSV
    </Button>
    <ButtonGroupSeparator />
    <Button size="sm" variant="outline" className="text-destructive">
      删除
    </Button>
  </ButtonGroup>
)

/**
 * Vertical groups take the separator too, but it does not turn by itself: the
 * default is `vertical`, so a stacked group has to say `orientation="horizontal"`
 * or it draws a one-pixel-wide line between two stacked buttons and looks like
 * nothing rendered at all.
 */
export const InAVerticalGroup = () => (
  <ButtonGroup orientation="vertical">
    <Button size="sm" variant="outline">
      导出 CSV
    </Button>
    <Button size="sm" variant="outline">
      下载模板
    </Button>
    <ButtonGroupSeparator orientation="horizontal" />
    <Button size="sm" variant="outline" className="text-destructive">
      清空导入草稿
    </Button>
  </ButtonGroup>
)
