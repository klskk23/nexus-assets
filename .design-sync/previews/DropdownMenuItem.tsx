import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * The account menu: a plain item and a `variant="destructive"` one, which is
 * the only way 退出登录 turns red -- a `text-destructive` class on the label
 * would miss the hover and focus states the variant also carries.
 */
export const AccountMenu = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          陈立
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem>设置</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * A `disabled` item states why an action is unavailable instead of hiding it:
 * 归还 is greyed out because the device is 在库 already, so the row does not
 * change shape between devices.
 */
export const WithDisabled = () => (
  <div className="flex w-full items-start" style={{ minHeight: 288 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          NX-0417 操作
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem>查看完整履历</DropdownMenuItem>
        <DropdownMenuItem>签出给持有方</DropdownMenuItem>
        <DropdownMenuItem disabled>归还</DropdownMenuItem>
        <DropdownMenuItem>打印标签</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">标记为丢失</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * `inset` reserves the left gutter a checkmark would occupy, so plain items
 * keep their text aligned with the checkable ones above them.
 */
export const Inset = () => (
  <div className="flex w-full items-start" style={{ minHeight: 224 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem inset>导出当前页</DropdownMenuItem>
        <DropdownMenuItem inset>导出全部筛选结果</DropdownMenuItem>
        <DropdownMenuItem inset>下载 CSV 模板</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
