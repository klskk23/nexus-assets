import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "nexus-assets-web"

/**
 * The header is Title + Description and nothing else -- no stray `<p>`, no
 * `div + Label`. It lays itself out from what is inside it: with no media it
 * is two rows, left-aligned at `size="default"`.
 */
export const TitleAndDescription = () => (
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
 * Drop an `AlertDialogMedia` in and the same header re-flows to put the glyph
 * in its own column beside the title -- that is the header reacting to its
 * children, not a second layout you write by hand.
 */
export const WithMedia = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia
          style={{ backgroundColor: "color-mix(in oklab, var(--destructive) 12%, transparent)", color: "var(--destructive)" }}
        >
          <span className="text-3xl leading-none">⚠</span>
        </AlertDialogMedia>
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
