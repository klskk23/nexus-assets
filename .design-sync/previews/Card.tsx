import { Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "nexus-assets-web"

/**
 * The full composition, which is the only one worth copying: the line under
 * the title is CardDescription and the control in the corner is CardAction --
 * neither is a <p> or an ml-auto, and getting that wrong is what made eleven
 * pages drift before they were pulled into one set of parts.
 */
export const Composed = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>类别分布</CardTitle>
      <CardDescription>含子类别，不含已报废</CardDescription>
      <CardAction>
        <Button variant="ghost" size="sm">
          查看全部
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        网络设备 62 台 · 服务器 18 台 · 终端 9 台
      </p>
    </CardContent>
    <CardFooter>
      <Button variant="outline" size="sm">
        导出这一批
      </Button>
    </CardFooter>
  </Card>
)

/** Header and content only -- the shape most cards in this product take. */
export const Plain = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>快速录入</CardTitle>
      <CardDescription>选一个类别，直接进录入表单</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">尚未选择类别。</p>
    </CardContent>
  </Card>
)
