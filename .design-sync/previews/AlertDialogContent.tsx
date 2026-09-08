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
 * `size="default"` -- the shape every destructive confirm in this product
 * takes. Content already renders its own Portal and Overlay, so this is the
 * whole of what a call site writes.
 */
export const Default = () => (
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
 * `size="sm"` narrows the box and keeps the header centred at every width,
 * with the footer as two equal columns. For a one-line question that needs no
 * detail -- here, a status disappearing from the dropdowns that offer it.
 */
export const Small = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogMedia
          style={{ backgroundColor: "color-mix(in oklab, var(--destructive) 12%, transparent)", color: "var(--destructive)" }}
        >
          <span className="text-3xl leading-none">⚠</span>
        </AlertDialogMedia>
        <AlertDialogTitle>删除状态</AlertDialogTitle>
        <AlertDialogDescription>「维修中」将从所有下拉框中移除。</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive">删除</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
