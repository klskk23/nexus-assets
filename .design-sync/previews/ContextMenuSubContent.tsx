import { useEffect, useRef, type ReactNode } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
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
 * The second panel. It is a menu in its own right: items, separators, radio
 * groups all work inside it, and it positions itself beside its trigger rather
 * than at the pointer, so a submenu near the right edge flips to the left on
 * its own.
 *
 * `useRightClicked` is preview scaffolding: the right-click both opens the menu
 * and tells Radix where to anchor it, so a card that only sets `open` on the
 * root would pin the menu to the corner of the viewport. Application code
 * writes neither.
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
            {/* Without this the flyout never shows: a menu that mounts open
                auto-focuses this panel's first item, and the sub content reads
                that as focus leaving it and closes itself. Silently -- the
                parent renders, the second panel does not. */}
            <ContextMenuContent onOpenAutoFocus={(e) => e.preventDefault()}>
              {menu}
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

/** A radio group inside the second panel: one status, already marked. */
export const StatusChoices = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub defaultOpen>
          <ContextMenuSubTrigger>改状态</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup value="checked_out">
              <ContextMenuRadioItem value="in_stock">在库</ContextMenuRadioItem>
              <ContextMenuRadioItem value="checked_out">已签出</ContextMenuRadioItem>
              <ContextMenuRadioItem value="repairing">维修中</ContextMenuRadioItem>
              <ContextMenuRadioItem value="lost">丢失</ContextMenuRadioItem>
              <ContextMenuRadioItem value="retired">已报废</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem>打印标签</ContextMenuItem>
      </>
    }
  />
)

/** Items and a separator: the recent holders, then the full picker. */
export const Destinations = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub defaultOpen>
          <ContextMenuSubTrigger>转移到</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>上海仓库</ContextMenuItem>
            <ContextMenuItem>北京机房</ContextMenuItem>
            <ContextMenuItem>研发二部</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>选择其他持有方…</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem>改负责人</ContextMenuItem>
      </>
    }
  />
)
