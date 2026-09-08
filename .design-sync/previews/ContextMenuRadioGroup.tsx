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
 * The one-of-many part of a menu: `value` lives on the group, not on the items,
 * so exactly one of them can carry the dot. Two groups in one panel each keep
 * their own value, which is what lets a sort key and a direction sit together.
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

/** One group: which column the list is sorted by. */
export const SortKey = () => (
  <HeaderMenu
    menu={
      <ContextMenuRadioGroup value="sn">
        <ContextMenuLabel>排序</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuRadioItem value="sn">资产编号</ContextMenuRadioItem>
        <ContextMenuRadioItem value="created">录入时间</ContextMenuRadioItem>
        <ContextMenuRadioItem value="moved">最近流转</ContextMenuRadioItem>
        <ContextMenuRadioItem value="status">状态</ContextMenuRadioItem>
      </ContextMenuRadioGroup>
    }
  />
)

/** Two groups, one panel: the key and the direction hold separate values. */
export const TwoGroups = () => (
  <HeaderMenu
    menu={
      <>
        <ContextMenuRadioGroup value="created">
          <ContextMenuLabel>排序</ContextMenuLabel>
          <ContextMenuRadioItem value="sn">资产编号</ContextMenuRadioItem>
          <ContextMenuRadioItem value="created">录入时间</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuRadioGroup value="desc">
          <ContextMenuLabel>方向</ContextMenuLabel>
          <ContextMenuRadioItem value="asc">升序</ContextMenuRadioItem>
          <ContextMenuRadioItem value="desc">降序</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </>
    }
  />
)
