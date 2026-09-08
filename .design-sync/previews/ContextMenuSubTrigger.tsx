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
 * The row a submenu hangs from. It looks like an item and behaves like one --
 * hover or arrow-right opens the second panel -- and the chevron on its right
 * is drawn by the component, not by the caller. `inset` lines it up with
 * checkbox and radio items when the panel mixes them.
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

/** Open: the trigger keeps the highlight for as long as its panel is up. */
export const Opened = () => (
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
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem>打印标签</ContextMenuItem>
      </>
    }
  />
)

/** At rest: two submenus closed, each showing only its chevron. */
export const AtRest = () => (
  <DeviceTable
    menu={
      <>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>转移到</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>上海仓库</ContextMenuItem>
            <ContextMenuItem>北京机房</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>改状态</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>在库</ContextMenuItem>
            <ContextMenuItem>维修中</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem>打印标签</ContextMenuItem>
      </>
    }
  />
)
