import { useEffect, useRef } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
 * The trigger is the thing that was right-clicked, and it is almost always
 * `asChild` over something that already exists -- a table row, a card. Wrapping
 * the row in the trigger's own `<span>` instead would break the table's markup
 * and lose the row's hover state.
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

/** The usual one: `asChild` over the row of a device table. */
export const RowTrigger = () => {
  const row = useRightClicked<HTMLTableRowElement>()
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>资产编号</TableHead>
            <TableHead>类别</TableHead>
            <TableHead>持有方</TableHead>
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
                <TableCell>终端</TableCell>
                <TableCell>研发二部 · 周敏</TableCell>
                <TableCell>
                  <StatusBadge status="checked_out" />
                </TableCell>
              </TableRow>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>查看全部流转</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem>归还</ContextMenuItem>
              <ContextMenuItem>转移</ContextMenuItem>
              <ContextMenuItem>打印标签</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </TableBody>
      </Table>
    </TableFrame>
  )
}

/** A whole card can be the trigger too -- the device panel on a detail page. */
export const BlockTrigger = () => {
  const block = useRightClicked<HTMLDivElement>(120, 40)
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <Card ref={block} style={{ maxWidth: "22rem" }}>
          <CardHeader>
            <CardTitle className="font-mono">NX-0418</CardTitle>
            <CardDescription>网络设备 · 上海仓库</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              负责人 周敏 · 签出于 2024-04-02
            </p>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>查看全部流转</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>归还</ContextMenuItem>
        <ContextMenuItem>改负责人</ContextMenuItem>
        <ContextMenuItem>打印标签</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
