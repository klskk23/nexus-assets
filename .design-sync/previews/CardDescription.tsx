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
 * The line under the title is CardDescription -- not a `<p>` you styled to
 * look like one. It already carries the small size and the muted colour, and
 * it is the second row of the header grid, so it stays aligned with the title
 * even when a CardAction is in the corner.
 *
 * Use it for the qualifier the numbers need: what is counted, and what is not.
 */
export const WhatIsCounted = () => (
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
 * The other thing it is good for: telling the reader what the card wants from
 * them. One short sentence -- anything longer belongs in the content, where it
 * can be read rather than skimmed past.
 */
export const WhatToDoNext = () => (
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
  </Card>
)

/**
 * A range or a scope reads well here too -- "最近 7 天，全部仓库" answers the
 * question a list of rows always raises, without spending a row on it.
 */
export const TheScope = () => (
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
  </Card>
)
