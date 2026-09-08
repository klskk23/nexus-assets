import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "nexus-assets-web"

/**
 * CardHeader is a grid, not a flex row, and that is the whole point: it grows a
 * second column by itself the moment a CardAction is inside it. So the corner
 * control needs no `ml-auto`, and the title still wraps under the control
 * instead of shoving it off the card.
 */
export const WithACornerControl = () => (
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
 * Title and description only -- one column, and the shape most cards in this
 * product take. Both rows are optional but the order is not: the description
 * belongs under the title, never above it as a kicker.
 */
export const TitleAndDescription = () => (
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

/**
 * Add `border-b` and the header picks up its own bottom padding -- the rule
 * for it lives in CardHeader, so a divided header needs one class and no
 * spacing of your own.
 */
export const Divided = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader className="border-b">
      <CardTitle>最近流转</CardTitle>
      <CardDescription>最近 7 天，全部仓库</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <span>NX-2417 已签出 · 陈立</span>
        <span>NX-2390 已归还 · 上海仓库</span>
        <span>NX-1188 维修中 · 送修中心</span>
      </div>
    </CardContent>
  </Card>
)
