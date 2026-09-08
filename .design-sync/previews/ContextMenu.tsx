import { useEffect, useRef } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
} from "nexus-assets-web"

/**
 * The row menu is a convention of this product, not a decoration: every table
 * here is "click the row to open it, right-click for the actions", and the menu
 * carries the same actions the selection bar offers so that one device can be
 * acted on without ticking it first. Items a colleague may not use are
 * `disabled`, never hidden -- an item nobody can see is an item nobody learns
 * exists.
 *
 * `useRightClicked` is preview scaffolding, not a pattern to copy. A context
 * menu is opened by the right-click on its trigger, and that click is also what
 * tells Radix where to anchor it; forced open with `open` and no interaction it
 * pins itself to the top-left corner of the viewport. So the card performs the
 * right-click the reader would have made. Application code writes neither.
 */
function useRightClicked<T extends HTMLElement>(x = 140, y = 16) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: r.left + x, clientY: r.top + y }),
    )
  }, [x, y])
  return ref
}

/** The device table's own menu, in the order the product offers it. */
export const AssetRow = () => {
  const row = useRightClicked<HTMLTableRowElement>()
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>资产编号</TableHead>
            <TableHead>类别</TableHead>
            <TableHead>位置</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="cursor-pointer">
            <TableCell className="font-mono">NX-0417</TableCell>
            <TableCell>网络设备</TableCell>
            <TableCell>上海仓库</TableCell>
            <TableCell>
              <StatusBadge status="in_stock" />
            </TableCell>
          </TableRow>
          <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
              <TableRow ref={row} className="cursor-pointer">
                <TableCell className="font-mono">NX-0418</TableCell>
                <TableCell>网络设备</TableCell>
                <TableCell>上海仓库</TableCell>
                <TableCell>
                  <StatusBadge status="checked_out" />
                </TableCell>
              </TableRow>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>查看全部流转</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem>签出</ContextMenuItem>
              <ContextMenuItem>归还</ContextMenuItem>
              <ContextMenuItem>转移</ContextMenuItem>
              <ContextMenuItem>改负责人</ContextMenuItem>
              <ContextMenuItem>打印标签</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive">删除</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <TableRow className="cursor-pointer">
            <TableCell className="font-mono">NX-0419</TableCell>
            <TableCell>服务器</TableCell>
            <TableCell>北京机房</TableCell>
            <TableCell>
              <StatusBadge status="repairing" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableFrame>
  )
}

/** The metadata tables carry a shorter menu: 编辑 / 解绑 / 删除. */
export const FieldRow = () => {
  const row = useRightClicked<HTMLTableRowElement>()
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>键名</TableHead>
            <TableHead>显示名</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>绑定到</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="cursor-pointer">
            <TableCell className="font-mono">mac</TableCell>
            <TableCell>MAC 地址</TableCell>
            <TableCell>文本</TableCell>
            <TableCell>网络设备</TableCell>
          </TableRow>
          <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
              <TableRow ref={row} className="cursor-pointer">
                <TableCell className="font-mono">rack_unit</TableCell>
                <TableCell>机位</TableCell>
                <TableCell>整数</TableCell>
                <TableCell>服务器</TableCell>
              </TableRow>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>编辑字段</ContextMenuItem>
              <ContextMenuItem>解绑</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive">删除字段</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </TableBody>
      </Table>
    </TableFrame>
  )
}
