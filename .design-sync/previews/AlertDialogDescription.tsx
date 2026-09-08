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
 * The house rule lives here: a destructive description names *what* will be
 * destroyed and *how much*. 「确定要删除吗？」 tells nobody that twelve devices
 * and their entire 流转历史 go with the click.
 */
export const NamesTheDamage = () => (
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
 * Where the server will refuse, the description says so up front and points at
 * the thing to do instead -- a refusal a person could have predicted is not
 * one they should have to trigger to learn about.
 */
export const SaysWhatIsRefused = () => (
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

/** When the confirm asks for a typed identifier, the description is the
 *  instruction that names it -- the input below is only carrying it out. */
export const AsksForTheIdentifier = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>删除资产</AlertDialogTitle>
        <AlertDialogDescription>
          此操作不可撤销。请输入编号 2199023255611 以确认。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled>
          删除
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
