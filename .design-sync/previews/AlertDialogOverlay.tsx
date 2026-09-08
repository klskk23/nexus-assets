import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "nexus-assets-web"

/**
 * The overlay is the dimmed sheet between the page and the dialog. You do not
 * write it: `AlertDialogContent` renders `AlertDialogPortal` + this overlay
 * around itself, which is why every confirm in this product dims the same way.
 * The list behind it here is real page content, showing what the dim does --
 * and unlike a plain Dialog, this overlay is not a way out: clicking it does
 * not close an AlertDialog, only 取消 or Esc does.
 */
export const OverPageContent = () => (
  <div style={{ width: "100%", maxWidth: "42rem" }}>
    <Card>
      <CardHeader>
        <CardTitle>网络设备</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <div className="flex items-center justify-between border-b" style={{ paddingBottom: "0.5rem" }}>
          <span className="font-mono">2199023255611</span>
          <span className="text-muted-foreground">上海仓库</span>
          <Badge variant="secondary">在库</Badge>
        </div>
        <div className="flex items-center justify-between border-b" style={{ paddingBottom: "0.5rem" }}>
          <span className="font-mono">2199023255612</span>
          <span className="text-muted-foreground">研发一部</span>
          <Badge variant="secondary">已签出</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono">2199023255613</span>
          <span className="text-muted-foreground">上海仓库</span>
          <Badge variant="secondary">维修中</Badge>
        </div>
      </CardContent>
    </Card>
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
  </div>
)

/**
 * The same overlay under a `size="sm"` content -- it is fixed to the viewport
 * and full-bleed regardless of how small the box above it is.
 */
export const UnderASmallDialog = () => (
  <div style={{ width: "100%", maxWidth: "42rem" }}>
    <Card>
      <CardHeader>
        <CardTitle>状态</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant="secondary">在库</Badge>
        <Badge variant="secondary">已签出</Badge>
        <Badge variant="secondary">维修中</Badge>
        <Badge variant="secondary">已报废</Badge>
      </CardContent>
    </Card>
    <AlertDialog defaultOpen>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>删除状态</AlertDialogTitle>
          <AlertDialogDescription>「维修中」将从所有下拉框中移除。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
)
