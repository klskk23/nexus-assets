import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "nexus-assets-web"

/**
 * Cancel is the quiet one -- `outline` by default, so the destructive button
 * beside it is the only thing that draws the eye. It is also the escape hatch
 * the dialog focuses on open, which is why it must stay the safe choice.
 */
export const Quiet = () => (
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
 * `variant="ghost"` quiets it further, for a dialog whose action is not
 * destructive and where the outline would read as a second real choice.
 * 取消 is the word; never 关闭, and never a bare ×.
 */
export const Ghost = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>保存并重算编号</AlertDialogTitle>
        <AlertDialogDescription>
          表达式改了，已有设备的编号仍是按旧表达式算出来的。取消则连这次修改一起放弃。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="ghost">取消</AlertDialogCancel>
        <AlertDialogAction>保存并重算</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
