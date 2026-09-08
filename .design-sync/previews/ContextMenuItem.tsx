import { useEffect, useRef, type ReactNode } from "react"
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
 * One action. Three things this product decided about it, all visible below:
 *
 * - An action a colleague's role does not allow is `disabled`, never dropped
 *   from the menu. Hiding it means nobody ever learns the action exists.
 * - The one that destroys something takes `variant="destructive"` and sits
 *   below a separator, so it is never the item next to the one you wanted.
 * - `inset` aligns an item with the ones that carry a tick, for a menu that
 *   mixes plain actions with checkbox or radio items.
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

/** The table the three cards below right-click into. */
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

/** Plain items: one line of Chinese each, no icon, no decoration. */
export const Actions = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuItem>签出</ContextMenuItem>
        <ContextMenuItem>归还</ContextMenuItem>
        <ContextMenuItem>转移</ContextMenuItem>
        <ContextMenuItem>打印标签</ContextMenuItem>
      </>
    }
  />
)

/** Without 流转创建 and 打印 permission: dimmed and inert, still readable. */
export const Disabled = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>签出</ContextMenuItem>
        <ContextMenuItem disabled>归还</ContextMenuItem>
        <ContextMenuItem disabled>转移</ContextMenuItem>
        <ContextMenuItem disabled>打印标签</ContextMenuItem>
      </>
    }
  />
)

/** The destructive item, kept away from the rest by a separator. */
export const Destructive = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuItem>改负责人</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">删除</ContextMenuItem>
      </>
    }
  />
)
