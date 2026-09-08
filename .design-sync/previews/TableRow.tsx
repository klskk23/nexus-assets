import { Button, StatusBadge, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * The unit of a ledger, and the click target.
 *
 * The whole row opens the device. Row actions therefore live at the end of the
 * row, appear on hover **and on focus** (so tabbing reaches something visible),
 * and every one of them stops propagation — without that, printing a label
 * would also open the device behind the dialog. Each carries an aria-label,
 * because three unnamed round buttons are three buttons a keyboard user cannot
 * tell apart.
 */
export const WithRowActions = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>资产编号</TableHead><TableHead>类别</TableHead>
          <TableHead>状态</TableHead><TableHead className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="cursor-pointer">
          <TableCell className="font-mono">2199023255611</TableCell>
          <TableCell>网络设备</TableCell>
          <TableCell><StatusBadge status="repairing" /></TableCell>
          <TableCell className="w-px">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="打印这一台的标签">⌸</Button>
              <Button variant="ghost" size="icon-sm" aria-label="变更这一台的状态">⇄</Button>
              <Button variant="ghost" size="icon-sm" aria-label="查看这一台的详情">ⓘ</Button>
            </div>
          </TableCell>
        </TableRow>
        <TableRow className="cursor-pointer">
          <TableCell className="font-mono">c40c1cd1</TableCell>
          <TableCell>服务器</TableCell>
          <TableCell><StatusBadge status="in_stock" /></TableCell>
          <TableCell className="w-px" />
        </TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)

/** Selected rows carry a tint, so a selection survives scrolling past it. */
export const Selected = () => (
  <TableFrame>
    <Table>
      <TableBody>
        <TableRow data-state="selected"><TableCell className="font-mono">2199023255611</TableCell><TableCell>网络设备</TableCell></TableRow>
        <TableRow><TableCell className="font-mono">2199023255610</TableCell><TableCell>网络设备</TableCell></TableRow>
        <TableRow data-state="selected"><TableCell className="font-mono">c40c1cd1</TableCell><TableCell>服务器</TableCell></TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
