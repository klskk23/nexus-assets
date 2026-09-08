import { useEffect, useRef, type ReactNode } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
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
 * One choice out of the group. The `value` is the identifier the page stores --
 * a status key, a page size -- and never the Chinese label beside it: the label
 * is translated, the key is not.
 *
 * A radio item that cannot be chosen right now is `disabled`, the same rule the
 * device menu follows: a colleague who cannot see the option never learns the
 * option exists.
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

/** The five built-in statuses. The device is 已签出, so that one holds the dot. */
export const StatusChoice = () => (
  <DeviceTable
    menu={
      <ContextMenuRadioGroup value="checked_out">
        <ContextMenuLabel>改状态</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuRadioItem value="in_stock">在库</ContextMenuRadioItem>
        <ContextMenuRadioItem value="checked_out">已签出</ContextMenuRadioItem>
        <ContextMenuRadioItem value="repairing">维修中</ContextMenuRadioItem>
        <ContextMenuRadioItem value="lost">丢失</ContextMenuRadioItem>
        <ContextMenuRadioItem value="retired">已报废</ContextMenuRadioItem>
      </ContextMenuRadioGroup>
    }
  />
)

/** 已报废 is terminal: offered, dimmed, and out of reach without the permission. */
export const OneDisabled = () => (
  <DeviceTable
    menu={
      <ContextMenuRadioGroup value="repairing">
        <ContextMenuLabel>改状态</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuRadioItem value="in_stock">在库</ContextMenuRadioItem>
        <ContextMenuRadioItem value="repairing">维修中</ContextMenuRadioItem>
        <ContextMenuRadioItem value="retired" disabled>
          已报废
        </ContextMenuRadioItem>
      </ContextMenuRadioGroup>
    }
  />
)
