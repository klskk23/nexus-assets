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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "nexus-assets-web"

/**
 * The portal is what lifts the dialog out of wherever it was written and into
 * the document body. `AlertDialogContent` renders it for you -- a call site
 * never writes `AlertDialogPortal` itself -- and that is the point: the confirm
 * below is declared inside a clipped, scrolling card, and still lands centred
 * over the whole viewport instead of being cropped by its parent.
 */
export const EscapesItsParent = () => (
  <div style={{ width: "100%", maxWidth: "36rem" }}>
    <Card className="max-h-56 overflow-hidden">
      <CardHeader>
        <CardTitle>字段 · 保修截止</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-muted-foreground">
          绑定在「网络设备」「服务器」两个类别上，已有 62 台设备填写过它。
        </p>
        <div className="flex items-center gap-2">
          <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                删除字段
              </Button>
            </AlertDialogTrigger>
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
        </div>
      </CardContent>
    </Card>
  </div>
)

/**
 * The same escape from a row's toolbar: the confirm is written next to the
 * 删除 button that owns it, and renders over the page rather than inside the
 * toolbar's own stacking context.
 */
export const FromARowToolbar = () => (
  <div style={{ width: "100%", maxWidth: "36rem" }}>
    <Card>
      <CardHeader>
        <CardTitle>已选 12 台</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline">
          变更状态
        </Button>
        <Button size="sm" variant="outline">
          导出 CSV
        </Button>
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
      </CardContent>
    </Card>
  </div>
)
