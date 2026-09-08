import { useEffect, useRef, type ReactNode } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
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
 * `ContextMenuGroup` ties items together for a screen reader: it is what makes
 * a `ContextMenuLabel` the *name* of the items under it rather than a stray
 * line of text above them. It draws nothing on its own -- the visible division
 * is still the separator.
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

function DeviceTable({ menu }: { menu: ReactNode }) {
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
            <ContextMenuContent>{menu}</ContextMenuContent>
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

/** Two named groups: what moves the device, and what only reads it. */
export const NamedGroups = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuGroup>
          <ContextMenuLabel>流转</ContextMenuLabel>
          <ContextMenuItem>签出</ContextMenuItem>
          <ContextMenuItem>归还</ContextMenuItem>
          <ContextMenuItem>转移</ContextMenuItem>
          <ContextMenuItem>改负责人</ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel>记录</ContextMenuLabel>
          <ContextMenuItem>查看全部流转</ContextMenuItem>
          <ContextMenuItem>打印标签</ContextMenuItem>
        </ContextMenuGroup>
      </>
    }
  />
)

/** Grouped without labels -- the grouping is still the thing being declared. */
export const PlainGroups = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuGroup>
          <ContextMenuItem>查看全部流转</ContextMenuItem>
          <ContextMenuItem>导出 CSV</ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem>签出</ContextMenuItem>
          <ContextMenuItem>归还</ContextMenuItem>
          <ContextMenuItem>打印标签</ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive">删除</ContextMenuItem>
        </ContextMenuGroup>
      </>
    }
  />
)
