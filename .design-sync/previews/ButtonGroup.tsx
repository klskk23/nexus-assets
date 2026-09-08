import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  Card,
  CardContent,
} from "nexus-assets-web"

/**
 * The segmented run of transfer actions, as the selection bar over the asset
 * table wears it. One act per button, all of them the same size and variant,
 * joined into a single control: these five are the same kind of thing done to
 * the same devices, and spacing them apart would say they were not.
 *
 * The group is `w-fit`, so it never stretches to the row it sits in.
 */
export const TransferActions = () => (
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
    <Button size="sm" variant="outline">
      改负责人
    </Button>
    <Button size="sm" variant="outline">
      改状态
    </Button>
  </ButtonGroup>
)

/**
 * Where that run actually lives: the bar that rises once rows are ticked. It
 * floats over the table it is about, so it is one row tall -- how many are
 * selected on the left, the acts in the middle, and the way out on the right.
 *
 * 删除 sits after a separator: the same click distance, a different act.
 */
export const InTheSelectionBar = () => (
  <Card className="gap-0 py-0 shadow-lg">
    <CardContent className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="text-sm font-medium">已选 12 台</span>
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
        <Button size="sm" variant="outline">
          导出 CSV
        </Button>
        <ButtonGroupSeparator />
        <Button size="sm" variant="outline" className="text-destructive">
          删除
        </Button>
      </ButtonGroup>
      <Button size="sm" variant="ghost" className="ml-auto">
        取消选择
      </Button>
    </CardContent>
  </Card>
)

/**
 * A permission the account does not hold disables its button rather than
 * hiding it -- a colleague who cannot see 删除 has no way to learn the act
 * exists, let alone who can perform it. The reason rides on `title`.
 */
export const PartlyDenied = () => (
  <ButtonGroup>
    <Button size="sm" variant="outline">
      签出
    </Button>
    <Button size="sm" variant="outline">
      归还
    </Button>
    <Button size="sm" variant="outline" disabled title="需要「打印标签」权限，请联系管理员">
      打印标签
    </Button>
    <ButtonGroupSeparator />
    <Button
      size="sm"
      variant="outline"
      className="text-destructive"
      disabled
      title="需要「删除设备」权限，请联系管理员"
    >
      删除
    </Button>
  </ButtonGroup>
)
