import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "nexus-assets-web"

/**
 * CardContent is the body, and all it does is supply the horizontal padding
 * that lines up with the header's. The vertical rhythm comes from the Card
 * itself, so the content needs no top margin -- adding one puts this card out
 * of step with every other card in the row.
 */
export const TheBody = () => (
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
  </Card>
)

/**
 * A list of rows inside it: the content sets its own internal spacing with a
 * flex column, which is the right place for it -- the padding stays the
 * card's, the rhythm between rows stays the list's.
 */
export const RowsInside = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>最近流转</CardTitle>
      <CardDescription>最近 7 天，全部仓库</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-mono tabular-nums">NX-2417</span>
          <Badge variant="secondary">已签出</Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-mono tabular-nums">NX-2390</span>
          <Badge variant="secondary">在库</Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-mono tabular-nums">NX-1188</span>
          <Badge variant="outline">维修中</Badge>
        </div>
      </div>
    </CardContent>
  </Card>
)

/**
 * Between a header and a footer it is just the middle band -- no borders of
 * its own. If you want a rule above the footer, put `border-t` on CardFooter,
 * which knows how much padding to add for it.
 */
export const BetweenHeaderAndFooter = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>快速录入</CardTitle>
      <CardDescription>选一个类别，直接进录入表单</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm">
          网络设备
        </Button>
        <Button variant="outline" size="sm">
          服务器
        </Button>
        <Button variant="outline" size="sm">
          终端
        </Button>
      </div>
    </CardContent>
    <CardFooter className="border-t">
      <Button size="sm">录入设备</Button>
    </CardFooter>
  </Card>
)
