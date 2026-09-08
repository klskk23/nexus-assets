import { Badge, StatusBadge, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * What a cell may hold in this product, and the one thing it may not.
 *
 * It may hold text, a monospaced identifier, a status chip, a truncated note
 * with the whole of it on hover. It may **not** hold a clickable control: the
 * row is itself a click target, so a button inside a cell fires twice and
 * produces two results from one click. Row actions go in the right-click menu
 * or in the hover strip at the row's end, which stops propagation.
 */
export const ContentKinds = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>资产编号</TableHead><TableHead>状态</TableHead>
          <TableHead>绑定到</TableHead><TableHead>备注</TableHead><TableHead>台数</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-mono">2199023255611</TableCell>
          <TableCell><StatusBadge status="repairing" /></TableCell>
          <TableCell><Badge variant="outline">类别</Badge> 网络设备</TableCell>
          <TableCell className="text-muted-foreground truncate" style={{ maxWidth: "12rem" }} title="屏幕左下角有划痕，2026 年 8 月入库时已存在">
            屏幕左下角有划痕，2026 年 8 月入库时已存在
          </TableCell>
          <TableCell className="tabular-nums">62</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-mono">c40c1cd1</TableCell>
          <TableCell><StatusBadge status="in_stock" /></TableCell>
          <TableCell><Badge variant="outline">厂商</Badge> Dell</TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell className="tabular-nums">7</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
