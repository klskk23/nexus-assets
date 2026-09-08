import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "nexus-assets-web"

/**
 * `AlertDialogTrigger` is always `asChild` around the product's own Button --
 * it must never render a second nested button. This is the whole loop: the
 * 删除 control in a row's toolbar, and the dialog it opens.
 */
export const Opened = () => (
  <AlertDialog defaultOpen>
    <AlertDialogTrigger asChild>
      <Button size="sm" variant="outline" className="text-destructive">
        删除
      </Button>
    </AlertDialogTrigger>
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
 * At rest the trigger is all that is on the page -- these are the two shapes
 * the product uses for it. An action chosen from a row's context menu has no
 * trigger at all: the menu has already closed by the time the dialog should
 * appear, so those call sites drive `open` themselves and omit this part.
 */
export const AtRest = () => (
  <div className="flex flex-wrap items-center gap-3">
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive">
          删除
        </Button>
      </AlertDialogTrigger>
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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">删除字段</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除字段</AlertDialogTitle>
          <AlertDialogDescription>
            「保修截止」将被彻底移除，包括它在各类别上的绑定。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive">删除字段</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
)
