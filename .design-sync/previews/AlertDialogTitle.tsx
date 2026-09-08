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
 * The title is the verb and its object -- 删除资产, 删除字段, 解绑 -- never
 * 「确认」 or 「注意」. It is also the dialog's accessible name, so a title that
 * says nothing leaves a screen reader announcing nothing.
 */
export const NamesTheAct = () => (
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
 * Not every alert dialog is a delete. A rule change that has to be re-applied
 * to devices already numbered under the old one is still an interruption worth
 * an AlertDialog -- same title shape, and the action keeps its default variant
 * because nothing is being destroyed.
 */
export const NonDestructive = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>保存并重算编号</AlertDialogTitle>
        <AlertDialogDescription>
          表达式改了，已有设备的编号仍是按旧表达式算出来的。保存的同时重算它们，编号才会一致。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction>保存并重算</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
