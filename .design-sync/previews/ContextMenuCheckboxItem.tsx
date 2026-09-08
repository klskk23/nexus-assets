import { useEffect, useRef, type ReactNode } from "react"
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
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
 * A menu item that stays after it is clicked, with a tick in the gutter. The
 * device table's columns are the case this product has: right-click the header,
 * choose which of the built-in and custom fields show.
 *
 * The tick's gutter is reserved for every item in the panel, so plain
 * `ContextMenuItem`s mixed in beside these need `inset` to line up with them.
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

/** Right-clicking the header is what opens a column menu. */
function HeaderMenu({ menu }: { menu: ReactNode }) {
  const head = useRightClicked<HTMLTableRowElement>()
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
              <TableRow ref={head} className="cursor-pointer">
                <TableHead>资产编号</TableHead>
                <TableHead>类别</TableHead>
                <TableHead>位置</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </ContextMenuTrigger>
            <ContextMenuContent>{menu}</ContextMenuContent>
          </ContextMenu>
        </TableHeader>
        <TableBody>
          <TableRow className="cursor-pointer">
            <TableCell className="font-mono">NX-0418</TableCell>
            <TableCell>网络设备</TableCell>
            <TableCell>上海仓库</TableCell>
            <TableCell>
              <StatusBadge status="checked_out" />
            </TableCell>
          </TableRow>
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

/** Four of the seven columns are on. */
export const Columns = () => (
  <HeaderMenu
    menu={
      <>
        <ContextMenuLabel>显示列</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>类别</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked>位置</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked>状态</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>持有方</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>负责人</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>备注</ContextMenuCheckboxItem>
      </>
    }
  />
)

/**
 * The number column is ticked and disabled rather than absent: it is what a row
 * is read by and what a click opens, so it cannot be turned off -- and saying
 * so is better than leaving the reader hunting for a switch that was removed.
 */
export const OneLocked = () => (
  <HeaderMenu
    menu={
      <>
        <ContextMenuLabel>显示列</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked disabled>
          资产编号
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked>类别</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked>位置</ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem>备注</ContextMenuCheckboxItem>
      </>
    }
  />
)
