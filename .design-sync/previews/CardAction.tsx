import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "nexus-assets-web"

/**
 * The control in a card's top-right corner is a CardAction. It is not a button
 * with `ml-auto` on it: CardAction claims the header grid's second column and
 * spans both its rows, which is what keeps it pinned to the top-right whether
 * the header has one line or three.
 *
 * Getting this wrong is what made eleven overview cards drift before they were
 * pulled into one set of parts.
 */
export const AGhostButton = () => (
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
 * It does not have to be a button. A Badge in the corner reads as a status for
 * the whole card -- still a CardAction, because the slot is about position in
 * the header, not about being clickable.
 */
export const AStatusBadge = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>最近流转</CardTitle>
      <CardDescription>最近 7 天，全部仓库</CardDescription>
      <CardAction>
        <Badge variant="outline">14 条</Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <span>NX-2417 已签出 · 陈立</span>
        <span>NX-2390 已归还 · 上海仓库</span>
      </div>
    </CardContent>
  </Card>
)

/**
 * An icon-sized action next to a title with no description: the slot is
 * `self-start`, so it stays level with the title's first line rather than
 * centring itself against a header that grew.
 */
export const IconSized = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>快速录入</CardTitle>
      <CardAction>
        <Button variant="ghost" size="icon" aria-label="更多">
          ⋮
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">尚未选择类别。</p>
    </CardContent>
  </Card>
)
