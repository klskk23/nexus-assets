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
 * The action is a Button underneath, so it takes `variant` and `size`. For a
 * delete it is `destructive`, and its label repeats the verb from the title --
 * 删除, not 确定: the button says what pressing it does.
 */
export const Destructive = () => (
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

/**
 * Disabled until the identifier is typed exactly. The value being asked for is
 * shown with a copy button beside it: copying still costs a deliberate press
 * on the thing being deleted, and a serial retyped by eye only produces typos.
 */
export const DisabledUntilTyped = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>删除资产</AlertDialogTitle>
        <AlertDialogDescription>
          上海仓库 · 网络设备 · 2199023255611 将被删除，连同它的全部流转历史。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="ada-phrase">此操作不可撤销。请输入 2199023255611 以确认。</Label>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-sm break-all">
            2199023255611
          </code>
          <Button type="button" variant="ghost" size="sm" aria-label="复制待输入的内容">
            ⧉ 复制
          </Button>
        </div>
        <Input
          id="ada-phrase"
          className="font-mono"
          defaultValue="21990232"
          autoComplete="off"
        />
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

/** Nothing is destroyed here, so the action keeps its default terracotta
 *  variant -- `destructive` is reserved for acts that lose data. */
export const DefaultVariant = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>解绑字段</AlertDialogTitle>
        <AlertDialogDescription>
          「保修截止」将从「网络设备」上解绑。已填写的值会保留，但不再显示在这个类别下。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction>解绑</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
