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
 * The footer holds exactly two controls and always in this order in the
 * markup: Cancel first, Action second. It reverses itself on a narrow screen
 * so the destructive one never sits under the thumb by accident.
 */
export const CancelThenAction = () => (
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
 * Inside a `size="sm"` content the same footer becomes two equal columns --
 * the layout follows the content's size, not a class you add here.
 */
export const TwoColumns = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>删除持有方</AlertDialogTitle>
        <AlertDialogDescription>
          「上海仓库」将被删除。仍有设备归属它时会被拒绝。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive">删除</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
