import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
} from "nexus-assets-web"

/**
 * The product's destructive-confirmation surface. Two house rules are visible
 * in every one of these: the description names *what* is destroyed and *how
 * much*, and the confirming button is the `destructive` one while 取消 stays
 * quiet. A dialog that only says 「确定吗？」 is not one this product ships.
 */
export const Plain = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>删除字段</AlertDialogTitle>
        <AlertDialogDescription>
          「保修截止」将被彻底移除，包括它在各类别上的绑定。有设备填写过它时会被拒绝 ——
          那种情况请改为从类别上解绑。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive">删除字段</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

/**
 * The most dangerous acts ask for the row's own identifier to be typed, and
 * show it with a copy button: a serial hand-copied off a label is a typo
 * waiting to happen, and a typo does not make a delete safer. The action stays
 * disabled until the typed value matches exactly.
 */
export const TypedIdentifier = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>删除资产</AlertDialogTitle>
        <AlertDialogDescription>
          上海仓库 · 网络设备 · 2199023255611 将被删除，连同它的全部流转历史。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="ad-phrase">此操作不可撤销。请输入 2199023255611 以确认。</Label>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-sm break-all">
            2199023255611
          </code>
          <Button type="button" variant="ghost" size="sm" aria-label="复制待输入的内容">
            ⧉ 复制
          </Button>
        </div>
        <Input id="ad-phrase" className="font-mono" defaultValue="" autoComplete="off" />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled>
          删除
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

/** A batch cannot ask for every number to be typed out, so it names the count
 *  instead -- and says that the 流转历史 goes with the devices. */
export const Bulk = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>删除资产</AlertDialogTitle>
        <AlertDialogDescription>
          此操作不可撤销，将删除选中的 12 台设备及其全部流转历史。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive">删除</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
