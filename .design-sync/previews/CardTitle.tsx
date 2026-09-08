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
 * The card's name, and the first row of the header grid. It is a semibold line
 * at the card's own text size -- resist growing it with a `text-lg`, because
 * eleven overview cards each picking their own heading size is exactly the
 * drift these parts were pulled together to stop.
 *
 * A noun phrase, not a sentence. The sentence is CardDescription's job.
 */
export const NamingTheCard = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>类别分布</CardTitle>
      <CardDescription>含子类别，不含已报废</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        网络设备 62 台 · 服务器 18 台 · 终端 9 台
      </p>
    </CardContent>
  </Card>
)

/**
 * A title on its own is a complete header -- the description is optional. What
 * is not optional is having a title: a card that opens straight into numbers
 * makes the reader work out what they are counting.
 */
export const TitleOnly = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>最近流转</CardTitle>
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
 * A long title wraps to a second line and the corner control stays put -- the
 * header's action column spans both rows, so nothing needs to be shortened to
 * keep the layout.
 */
export const WrappingBesideAnAction = () => (
  <Card style={{ maxWidth: "22rem" }}>
    <CardHeader>
      <CardTitle>上海仓库的网络设备分布</CardTitle>
      <CardDescription>按子类别统计</CardDescription>
      <CardAction>
        <Button variant="ghost" size="sm">
          查看全部
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">交换机 31 台 · 路由器 18 台 · AP 13 台</p>
    </CardContent>
  </Card>
)
