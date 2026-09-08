import { useEffect, useRef, type ReactNode } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
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
 * The portal is what lifts the open panel out of the table and onto the end of
 * the document, so a menu opened on the last visible row is not clipped by the
 * table's own scroll box or covered by the row after it.
 *
 * In this library you almost never write it: `ContextMenuContent` already wraps
 * itself in one, which is why every other card here goes straight from
 * `ContextMenu` to `ContextMenuContent`. Reach for it explicitly only to hold a
 * menu somewhere other than the document body.
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

/** The last row of a table -- the case the portal exists for. */
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
            {menu}
          </ContextMenu>
        </TableBody>
      </Table>
    </TableFrame>
  )
}

/** The form to write: the content portals itself, and the panel overflows the
 *  table's last row instead of being cut off by it. */
export const Implicit = () => (
  <DeviceTable
    menu={
      <ContextMenuContent>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>归还</ContextMenuItem>
        <ContextMenuItem>转移</ContextMenuItem>
        <ContextMenuItem>打印标签</ContextMenuItem>
      </ContextMenuContent>
    }
  />
)

/** The explicit form, for when the panel has to live in a named container.
 *  It renders identically -- this is the only thing that changes. */
export const Explicit = () => (
  <DeviceTable
    menu={
      <ContextMenuPortal>
        <ContextMenuContent>
          <ContextMenuItem>查看全部流转</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>归还</ContextMenuItem>
          <ContextMenuItem>转移</ContextMenuItem>
          <ContextMenuItem>打印标签</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenuPortal>
    }
  />
)
