import {
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
 * The last band of the card: a flex row, vertically centred, with the same
 * horizontal padding as the header and the content. It is for what you do
 * after reading the card -- the control that acts on the card's whole subject.
 * A control that acts on the card's title belongs in CardAction instead.
 */
export const OneAction = () => (
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

/**
 * `border-t` is the one class this part is waiting for: the rule for its top
 * padding lives inside CardFooter, so a divided footer needs the border and
 * nothing else -- no `pt-6` of your own.
 */
export const Divided = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
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
    <CardFooter className="border-t">
      <Button variant="ghost" size="sm">
        查看全部流转
      </Button>
    </CardFooter>
  </Card>
)

/**
 * Two things in the footer: `justify-between` pushes a secondary note to one
 * end and the control to the other. The footer is already a flex row, so this
 * is a class on the footer -- not a wrapper div inside it.
 */
export const NoteAndControl = () => (
  <Card style={{ maxWidth: "28rem" }}>
    <CardHeader>
      <CardTitle>快速录入</CardTitle>
      <CardDescription>选一个类别，直接进录入表单</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">已选：网络设备</p>
    </CardContent>
    <CardFooter className="justify-between border-t">
      <span className="text-xs text-muted-foreground">上次录入 2 小时前</span>
      <Button size="sm">录入设备</Button>
    </CardFooter>
  </Card>
)
