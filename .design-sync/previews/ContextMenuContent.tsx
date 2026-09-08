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
 * `ContextMenuContent` is the floating panel itself. It portals and positions
 * itself at the pointer; nothing about the trigger's layout constrains it, so a
 * menu inside a scrolling table is not clipped by it.
 *
 * `useRightClicked` is preview scaffolding: the right-click both opens the menu
 * and tells Radix where to anchor it, so a card that only sets `open` would pin
 * the menu to the corner of the viewport. Application code writes neither.
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

/** The device table's full menu -- seven actions in three groups. */
export const RowActions = () => {
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

/** The metadata tables' short one. The panel takes the width of its items. */
export const Compact = () => {
  const row = useRightClicked<HTMLTableRowElement>(100, 16)
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>类别</TableHead>
            <TableHead>编码</TableHead>
            <TableHead>设备数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
              <TableRow ref={row} className="cursor-pointer">
                <TableCell>网络设备</TableCell>
                <TableCell className="font-mono">NET</TableCell>
                <TableCell>62</TableCell>
              </TableRow>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>编辑类别</ContextMenuItem>
              <ContextMenuItem>导出 CSV</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive">删除类别</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <TableRow className="cursor-pointer">
            <TableCell>服务器</TableCell>
            <TableCell className="font-mono">SRV</TableCell>
            <TableCell>18</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableFrame>
  )
}
